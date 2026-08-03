import { describe, expect, it } from "vitest";
import type { JellyfinItem } from "../jellyfin/types";
import { getFileSizeBytes, getResolutionLabel, hasMediaFile, mapWatched } from "./mappers";

function item(overrides: Partial<JellyfinItem> = {}): JellyfinItem {
  return { Id: "1", Name: "Item", Type: "Movie", ...overrides };
}

describe("hasMediaFile", () => {
  it("is true when a Container is present", () => {
    expect(hasMediaFile(item({ Container: "mkv" }))).toBe(true);
  });

  it("is false for placeholder items with no Container", () => {
    expect(hasMediaFile(item())).toBe(false);
  });
});

describe("getFileSizeBytes", () => {
  it("reads the size of the primary media source", () => {
    expect(getFileSizeBytes(item({ MediaSources: [{ Size: 12345 }] }))).toBe(12345);
  });

  it("is null when no media source is present", () => {
    expect(getFileSizeBytes(item())).toBeNull();
  });
});

describe("getResolutionLabel", () => {
  it.each([
    [2160, "4K"],
    [1440, "1440p"],
    [1080, "1080p"],
    [720, "720p"],
    [480, "480p"],
    [360, "360p"],
  ])("labels height %d as %s", (height, label) => {
    const withHeight = item({ MediaSources: [{ MediaStreams: [{ Type: "Video", Height: height }] }] });
    expect(getResolutionLabel(withHeight)).toBe(label);
  });

  it("is null when there's no video stream", () => {
    expect(getResolutionLabel(item({ MediaSources: [{ MediaStreams: [{ Type: "Audio" }] }] }))).toBeNull();
  });
});

describe("mapWatched", () => {
  it("is null when no user was requested, regardless of UserData", () => {
    expect(mapWatched(item({ UserData: { Played: true } }), false)).toBeNull();
  });

  it("reports Played when a user was requested", () => {
    expect(mapWatched(item({ UserData: { Played: true } }), true)).toBe(true);
    expect(mapWatched(item({ UserData: { Played: false } }), true)).toBe(false);
  });

  it("defaults to false when a user was requested but UserData is missing", () => {
    expect(mapWatched(item(), true)).toBe(false);
  });
});
