import { describe, expect, it } from "vitest";
import { parseQuality } from "./quality";

describe("parseQuality", () => {
  it.each(["1080p", "720p", "480p", "360p"])("accepts %s", (value) => {
    expect(parseQuality(value)).toBe(value);
  });

  it.each([undefined, null, "", "4k", "original", 720, ["720p"]])("falls back to 'original' for %s", (value) => {
    expect(parseQuality(value)).toBe("original");
  });
});
