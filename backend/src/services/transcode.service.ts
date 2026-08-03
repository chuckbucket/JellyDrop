import type { TranscodeQuality } from "@shared/types";
import type { JellyfinItem } from "../jellyfin/types";
import { getFileSizeBytes, getVideoHeight } from "../utils/mappers";

export const QUALITY_TARGET_HEIGHT: Record<Exclude<TranscodeQuality, "original">, number> = {
  "1080p": 1080,
  "720p": 720,
  "480p": 480,
  "360p": 360,
};

/**
 * "Already small enough" ceilings — standard web-encode H.264 bitrate guidance at each resolution.
 * Below this, transcoding down to that resolution wouldn't meaningfully shrink the file, so the
 * source is served untouched instead. Also used as the target `videoBitRate` sent to Jellyfin's
 * transcoder when a transcode does happen.
 */
export const QUALITY_BITRATE_CEILING_BPS: Record<Exclude<TranscodeQuality, "original">, number> = {
  "1080p": 4_500_000,
  "720p": 2_500_000,
  "480p": 1_200_000,
  "360p": 700_000,
};

/** Jellyfin's RunTimeTicks are 100ns units. */
export function estimateBitrateBps(sizeBytes: number | null, runTimeTicks: number | null | undefined): number | null {
  if (!sizeBytes || !runTimeTicks) return null;
  const seconds = runTimeTicks / 10_000_000;
  return seconds > 0 ? Math.round((sizeBytes * 8) / seconds) : null;
}

export interface TranscodeDecision {
  shouldTranscode: boolean;
  targetHeight: number | null;
  reason: string;
}

/**
 * Skip-transcode decision. Both the resolution and bitrate checks are "positive proof" checks —
 * they only skip transcoding when they can confirm the source already qualifies, so missing
 * data (nulls) always falls through to transcoding, honoring the caller's explicit request rather
 * than silently ignoring it.
 */
export function decideTranscode(input: {
  quality: TranscodeQuality;
  sourceHeightPx: number | null;
  sourceBitrateBps: number | null;
}): TranscodeDecision {
  if (input.quality === "original") {
    return { shouldTranscode: false, targetHeight: null, reason: "original requested" };
  }

  const targetHeight = QUALITY_TARGET_HEIGHT[input.quality];

  if (input.sourceHeightPx !== null && input.sourceHeightPx <= targetHeight) {
    return {
      shouldTranscode: false,
      targetHeight,
      reason: `source is already ${input.sourceHeightPx}p (<= ${targetHeight}p target)`,
    };
  }

  const ceiling = QUALITY_BITRATE_CEILING_BPS[input.quality];
  if (input.sourceBitrateBps !== null && input.sourceBitrateBps <= ceiling) {
    return {
      shouldTranscode: false,
      targetHeight,
      reason: `source bitrate ${input.sourceBitrateBps}bps already <= ${ceiling}bps ceiling`,
    };
  }

  return { shouldTranscode: true, targetHeight, reason: "exceeds target resolution/bitrate" };
}

/** Convenience wrapper over `decideTranscode` that pulls resolution/bitrate straight off a Jellyfin item. */
export function decideTranscodeForItem(item: JellyfinItem, quality: TranscodeQuality): TranscodeDecision {
  return decideTranscode({
    quality,
    sourceHeightPx: getVideoHeight(item),
    sourceBitrateBps: estimateBitrateBps(getFileSizeBytes(item), item.RunTimeTicks),
  });
}
