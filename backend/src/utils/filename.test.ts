import { describe, expect, it } from "vitest";
import { buildEpisodeFilename, buildMovieFilename, buildZipFilename } from "./filename";

describe("buildMovieFilename", () => {
  it("includes the year when known", () => {
    expect(buildMovieFilename("Blade Runner", 1982, "mkv")).toBe("Blade Runner (1982).mkv");
  });

  it("omits the year when unknown", () => {
    expect(buildMovieFilename("Blade Runner", null, "mkv")).toBe("Blade Runner.mkv");
  });

  it("strips filesystem-unsafe characters", () => {
    expect(buildMovieFilename('Se7en: A "Story"?', 1995, "mkv")).toBe("Se7en A Story (1995).mkv");
  });

  it("uses only the first of multiple reported containers", () => {
    expect(buildMovieFilename("Movie", 2020, "mkv,webm")).toBe("Movie (2020).mkv");
  });
});

describe("buildEpisodeFilename", () => {
  it("zero-pads season and episode numbers", () => {
    expect(buildEpisodeFilename("Show", 1, 2, "Pilot", "mp4")).toBe("Show - S01E02 - Pilot.mp4");
  });

  it("falls back to 00 for missing season/episode numbers", () => {
    expect(buildEpisodeFilename("Show", null, null, "Special", "mp4")).toBe("Show - S00E00 - Special.mp4");
  });
});

describe("buildZipFilename", () => {
  it("appends .zip and sanitizes the name", () => {
    expect(buildZipFilename("Show: Season 1")).toBe("Show Season 1.zip");
  });
});
