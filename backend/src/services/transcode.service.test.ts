import { describe, expect, it } from "vitest";
import type { JellyfinItem } from "../jellyfin/types";
import { decideTranscode, decideTranscodeForItem, estimateBitrateBps } from "./transcode.service";

function item(overrides: Partial<JellyfinItem> = {}): JellyfinItem {
  return { Id: "1", Name: "Item", Type: "Episode", ...overrides };
}

describe("estimateBitrateBps", () => {
  it("derives bps from size and duration", () => {
    // 100MB over 400 seconds (400 * 10_000_000 ticks) = 800_000_000 bits / 400s = 2_000_000 bps
    expect(estimateBitrateBps(100_000_000, 400 * 10_000_000)).toBe(2_000_000);
  });

  it("is null when size is missing", () => {
    expect(estimateBitrateBps(null, 400 * 10_000_000)).toBeNull();
  });

  it("is null when duration is missing", () => {
    expect(estimateBitrateBps(100_000_000, undefined)).toBeNull();
    expect(estimateBitrateBps(100_000_000, 0)).toBeNull();
  });
});

describe("decideTranscode", () => {
  it("never transcodes when 'original' is requested, regardless of source data", () => {
    const decision = decideTranscode({ quality: "original", sourceHeightPx: 2160, sourceBitrateBps: 50_000_000 });
    expect(decision.shouldTranscode).toBe(false);
  });

  it.each([
    ["1080p", 1080],
    ["720p", 720],
    ["480p", 480],
    ["360p", 360],
  ] as const)("skips transcoding %s when source height already <= target", (quality, targetHeight) => {
    const decision = decideTranscode({ quality, sourceHeightPx: targetHeight, sourceBitrateBps: null });
    expect(decision.shouldTranscode).toBe(false);
    expect(decision.targetHeight).toBe(targetHeight);
  });

  it("transcodes when source height exceeds the target", () => {
    const decision = decideTranscode({ quality: "720p", sourceHeightPx: 1080, sourceBitrateBps: null });
    expect(decision.shouldTranscode).toBe(true);
    expect(decision.targetHeight).toBe(720);
  });

  it("skips transcoding when source bitrate is already at or below the quality's ceiling", () => {
    const decision = decideTranscode({ quality: "720p", sourceHeightPx: 1080, sourceBitrateBps: 2_000_000 });
    expect(decision.shouldTranscode).toBe(false);
  });

  it("transcodes when source bitrate exceeds the ceiling even at a qualifying resolution reading is unavailable", () => {
    const decision = decideTranscode({ quality: "720p", sourceHeightPx: 1080, sourceBitrateBps: 3_000_000 });
    expect(decision.shouldTranscode).toBe(true);
  });

  it("defaults to transcoding when resolution/bitrate can't be determined (honors the explicit request)", () => {
    const decision = decideTranscode({ quality: "480p", sourceHeightPx: null, sourceBitrateBps: null });
    expect(decision.shouldTranscode).toBe(true);
    expect(decision.targetHeight).toBe(480);
  });
});

describe("decideTranscodeForItem", () => {
  it("pulls height/bitrate straight off a Jellyfin item", () => {
    const smallItem = item({
      MediaSources: [{ Size: 100_000_000, MediaStreams: [{ Type: "Video", Height: 480 }] }],
      RunTimeTicks: 400 * 10_000_000,
    });
    expect(decideTranscodeForItem(smallItem, "480p").shouldTranscode).toBe(false);

    const bigItem = item({
      MediaSources: [{ Size: 2_000_000_000, MediaStreams: [{ Type: "Video", Height: 1080 }] }],
      RunTimeTicks: 400 * 10_000_000,
    });
    expect(decideTranscodeForItem(bigItem, "480p").shouldTranscode).toBe(true);
  });
});
