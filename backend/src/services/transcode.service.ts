import type { SizeOption, TranscodeQuality } from "@shared/types";

type SizeTierQuality = Exclude<TranscodeQuality, "original">;

interface SizeTier {
  quality: SizeTierQuality;
  /** Target encode bitrate — this is what actually determines the resulting file size (bitrate is
   *  duration-independent, so the same three tiers naturally scale to a sensible size for both a
   *  20-minute episode and a 2-hour movie without needing separate tables per content type). */
  bitrateBps: number;
  /** A reasonable encode height to pair with the bitrate above — capped at the source's own height
   *  in decideTranscode so a tier never upscales. Which tiers get *offered* is bitrate-only (see
   *  computeSizeOptions); this is only used once a transcode is already happening. */
  targetHeight: number;
}

// Calibrated against real examples: for a ~22-minute TV episode these produce roughly
// 110MB / 190MB / 390MB, and for a ~2-hour movie roughly 600MB / 1.1GB / 2.2GB.
export const SIZE_TIERS: SizeTier[] = [
  { quality: "small", bitrateBps: 700_000, targetHeight: 360 },
  { quality: "medium", bitrateBps: 1_200_000, targetHeight: 480 },
  { quality: "large", bitrateBps: 2_500_000, targetHeight: 720 },
];

function tierFor(quality: SizeTierQuality): SizeTier {
  const tier = SIZE_TIERS.find((t) => t.quality === quality);
  if (!tier) throw new Error(`Unknown transcode quality: ${quality}`);
  return tier;
}

/** Jellyfin's RunTimeTicks are 100ns units. */
export function ticksToSeconds(runTimeTicks: number | null | undefined): number | null {
  if (!runTimeTicks || runTimeTicks <= 0) return null;
  return runTimeTicks / 10_000_000;
}

export function estimateBitrateBps(sizeBytes: number | null, runTimeTicks: number | null | undefined): number | null {
  const seconds = ticksToSeconds(runTimeTicks);
  if (!sizeBytes || !seconds) return null;
  return Math.round((sizeBytes * 8) / seconds);
}

/** Rounds to the nearest even number — required for H.264 encode dimensions. */
function toEven(n: number): number {
  const rounded = Math.round(n);
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

/** Preserves the source's own aspect ratio at the target height — never assumes 16:9. Only falls
 *  back to a 16:9 guess when the source's own dimensions genuinely aren't known. */
export function computeTargetWidth(sourceWidth: number | null, sourceHeight: number | null, targetHeight: number): number {
  if (sourceWidth && sourceHeight) {
    return toEven((sourceWidth / sourceHeight) * targetHeight);
  }
  return toEven((targetHeight * 16) / 9);
}

export interface TranscodeDecision {
  shouldTranscode: boolean;
  targetWidth: number | null;
  targetHeight: number | null;
  bitrateBps: number | null;
  reason: string;
}

/**
 * Skip-transcode decision — bitrate only. A tier is worth applying exactly when it would actually
 * shrink the file (source bitrate exceeds the tier's target); resolution plays no part in that
 * call, only in picking a sensible encode height once transcoding is already happening — and even
 * then it's capped at the source's own height so a tier never upscales.
 */
export function decideTranscode(input: {
  quality: TranscodeQuality;
  sourceWidthPx: number | null;
  sourceHeightPx: number | null;
  sourceBitrateBps: number | null;
}): TranscodeDecision {
  if (input.quality === "original") {
    return { shouldTranscode: false, targetWidth: null, targetHeight: null, bitrateBps: null, reason: "original requested" };
  }

  const tier = tierFor(input.quality);
  const targetHeight = input.sourceHeightPx ? Math.min(tier.targetHeight, input.sourceHeightPx) : tier.targetHeight;
  const targetWidth = computeTargetWidth(input.sourceWidthPx, input.sourceHeightPx, targetHeight);

  if (input.sourceBitrateBps !== null && input.sourceBitrateBps <= tier.bitrateBps) {
    return {
      shouldTranscode: false,
      targetWidth,
      targetHeight,
      bitrateBps: tier.bitrateBps,
      reason: `source bitrate ${input.sourceBitrateBps}bps already <= ${tier.bitrateBps}bps target`,
    };
  }

  return { shouldTranscode: true, targetWidth, targetHeight, bitrateBps: tier.bitrateBps, reason: "exceeds target bitrate" };
}

/**
 * The selectable download-size options for one item — only tiers that would actually shrink the
 * file are included (a tier that wouldn't make it smaller is never offered), in small→large order.
 * Empty when the source is already efficient enough that no tier would help.
 */
export function computeSizeOptions(
  sourceSizeBytes: number | null,
  sourceBitrateBps: number | null,
  runTimeTicks: number | null | undefined
): SizeOption[] {
  const seconds = ticksToSeconds(runTimeTicks);
  if (!sourceSizeBytes || !sourceBitrateBps || !seconds) return [];

  const options: SizeOption[] = [];
  for (const tier of SIZE_TIERS) {
    if (tier.bitrateBps >= sourceBitrateBps) continue;
    const estimatedBytes = Math.round((tier.bitrateBps * seconds) / 8);
    if (estimatedBytes >= sourceSizeBytes) continue;
    options.push({ quality: tier.quality, estimatedBytes });
  }
  return options;
}

export interface EpisodeSizeInput {
  sizeBytes: number | null;
  bitrateBps: number | null;
  durationSeconds: number | null;
}

/**
 * Same idea as computeSizeOptions, but summed across many episodes (a season or a whole series
 * zip) — each episode is judged individually (skipped if it's already smaller than a given tier),
 * matching the real per-episode skip logic the zip endpoints already apply, so the total reflects
 * what an actual download would produce rather than a naive "bitrate × total duration" guess.
 */
export function computeAggregateSizeOptions(episodes: EpisodeSizeInput[]): SizeOption[] {
  const known = episodes.filter((episode): episode is EpisodeSizeInput & { sizeBytes: number } => episode.sizeBytes !== null);
  if (known.length === 0) return [];
  const totalOriginalBytes = known.reduce((sum, episode) => sum + episode.sizeBytes, 0);

  const options: SizeOption[] = [];
  for (const tier of SIZE_TIERS) {
    let total = 0;
    for (const episode of known) {
      const wouldShrink = episode.bitrateBps !== null && episode.durationSeconds !== null && episode.bitrateBps > tier.bitrateBps;
      total += wouldShrink ? Math.round((tier.bitrateBps * episode.durationSeconds!) / 8) : episode.sizeBytes;
    }
    if (total < totalOriginalBytes) {
      options.push({ quality: tier.quality, estimatedBytes: total });
    }
  }
  return options;
}
