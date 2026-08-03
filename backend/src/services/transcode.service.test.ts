import { describe, expect, it } from "vitest";
import {
  computeAggregateSizeOptions,
  computeSizeOptions,
  computeTargetWidth,
  decideTranscode,
  estimateBitrateBps,
  ticksToSeconds,
} from "./transcode.service";

describe("ticksToSeconds", () => {
  it("converts 100ns ticks to seconds", () => {
    expect(ticksToSeconds(400 * 10_000_000)).toBe(400);
  });

  it("is null for missing or zero ticks", () => {
    expect(ticksToSeconds(undefined)).toBeNull();
    expect(ticksToSeconds(null)).toBeNull();
    expect(ticksToSeconds(0)).toBeNull();
  });
});

describe("estimateBitrateBps", () => {
  it("derives bps from size and duration", () => {
    // 100MB over 400 seconds = 800_000_000 bits / 400s = 2_000_000 bps
    expect(estimateBitrateBps(100_000_000, 400 * 10_000_000)).toBe(2_000_000);
  });

  it("is null when size or duration is missing", () => {
    expect(estimateBitrateBps(null, 400 * 10_000_000)).toBeNull();
    expect(estimateBitrateBps(100_000_000, undefined)).toBeNull();
  });
});

describe("computeTargetWidth", () => {
  it("preserves the source's own aspect ratio, not a fixed 16:9 assumption", () => {
    // 4:3 source (1440x1080) at target height 480 -> 640 wide, not a 16:9-shaped 854.
    expect(computeTargetWidth(1440, 1080, 480)).toBe(640);
  });

  it("falls back to a 16:9 guess only when the source's own dimensions are unknown", () => {
    expect(computeTargetWidth(null, null, 480)).toBe(852);
  });

  it("rounds to an even number (required for H.264 encode dimensions)", () => {
    expect(computeTargetWidth(1919, 1079, 481) % 2).toBe(0);
  });
});

describe("decideTranscode", () => {
  it("never transcodes when 'original' is requested, regardless of source data", () => {
    const decision = decideTranscode({ quality: "original", sourceWidthPx: 3840, sourceHeightPx: 2160, sourceBitrateBps: 50_000_000 });
    expect(decision.shouldTranscode).toBe(false);
  });

  it.each([
    ["small", 700_000],
    ["medium", 1_200_000],
    ["large", 2_500_000],
  ] as const)("skips transcoding '%s' when source bitrate is already at or below the tier's target", (quality, tierBitrate) => {
    const decision = decideTranscode({ quality, sourceWidthPx: 1920, sourceHeightPx: 1080, sourceBitrateBps: tierBitrate });
    expect(decision.shouldTranscode).toBe(false);
  });

  it("transcodes when source bitrate exceeds the tier's target", () => {
    const decision = decideTranscode({ quality: "medium", sourceWidthPx: 1920, sourceHeightPx: 1080, sourceBitrateBps: 5_000_000 });
    expect(decision.shouldTranscode).toBe(true);
    expect(decision.bitrateBps).toBe(1_200_000);
  });

  it("defaults to transcoding when bitrate can't be determined (honors the explicit request)", () => {
    const decision = decideTranscode({ quality: "small", sourceWidthPx: null, sourceHeightPx: null, sourceBitrateBps: null });
    expect(decision.shouldTranscode).toBe(true);
  });

  it("never upscales — the encode height is capped at the source's own height even for a high-bitrate tier", () => {
    // "large" normally targets 720p, but a 360p source should never be scaled up to reach it.
    const decision = decideTranscode({ quality: "large", sourceWidthPx: 640, sourceHeightPx: 360, sourceBitrateBps: 10_000_000 });
    expect(decision.targetHeight).toBe(360);
  });

  it("computes targetWidth preserving the source's own (non-16:9) aspect ratio", () => {
    const decision = decideTranscode({ quality: "medium", sourceWidthPx: 1440, sourceHeightPx: 1080, sourceBitrateBps: 5_000_000 });
    expect(decision.targetHeight).toBe(480);
    expect(decision.targetWidth).toBe(640);
  });
});

describe("computeSizeOptions", () => {
  it("offers every tier, in small->large order, when the source is high-bitrate enough for all three", () => {
    const options = computeSizeOptions(500_000_000, 8_000_000, 400 * 10_000_000);
    expect(options.map((o) => o.quality)).toEqual(["small", "medium", "large"]);
  });

  it("excludes tiers that wouldn't shrink an already-fairly-efficient file", () => {
    const options = computeSizeOptions(50_000_000, 1_000_000, 400 * 10_000_000);
    expect(options.map((o) => o.quality)).toEqual(["small"]);
    expect(options[0].estimatedBytes).toBe(35_000_000);
  });

  it("returns empty when duration/size/bitrate are unknown", () => {
    expect(computeSizeOptions(null, 1_000_000, 400 * 10_000_000)).toEqual([]);
    expect(computeSizeOptions(100, 1_000_000, undefined)).toEqual([]);
    expect(computeSizeOptions(100, null, 400 * 10_000_000)).toEqual([]);
  });
});

describe("computeAggregateSizeOptions", () => {
  it("sums each episode's own best outcome — transcoded if a tier would shrink it, original size otherwise", () => {
    const episodes = [
      { sizeBytes: 50_000_000, bitrateBps: 1_000_000, durationSeconds: 400 }, // "small" tier would shrink this to 35MB
      { sizeBytes: 10_000_000, bitrateBps: 200_000, durationSeconds: 400 }, // already below every tier — stays as-is
    ];

    const options = computeAggregateSizeOptions(episodes);

    // "medium"/"large" would leave both episodes untouched (neither total shrinks), so only "small" qualifies.
    expect(options).toEqual([{ quality: "small", estimatedBytes: 45_000_000 }]);
  });

  it("is empty when no episode has a known size", () => {
    expect(computeAggregateSizeOptions([{ sizeBytes: null, bitrateBps: null, durationSeconds: null }])).toEqual([]);
  });

  it("is empty for an empty episode list", () => {
    expect(computeAggregateSizeOptions([])).toEqual([]);
  });
});
