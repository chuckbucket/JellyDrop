import { describe, expect, it } from "vitest";
import { parseQuality } from "./quality";

describe("parseQuality", () => {
  it.each(["small", "medium", "large"])("accepts %s", (value) => {
    expect(parseQuality(value)).toBe(value);
  });

  it.each([undefined, null, "", "720p", "1080p", "original", 720, ["small"]])("falls back to 'original' for %s", (value) => {
    expect(parseQuality(value)).toBe("original");
  });
});
