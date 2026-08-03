import { describe, expect, it } from "vitest";
import type { JellyfinItem } from "../jellyfin/types";
import { filterUnwatched } from "./download.service";

function episode(id: string, played?: boolean): JellyfinItem {
  return { Id: id, Name: id, Type: "Episode", UserData: played === undefined ? undefined : { Played: played } };
}

describe("filterUnwatched", () => {
  const episodes = [episode("a", true), episode("b", false), episode("c")];

  it("passes everything through when unwatchedOnly is false", () => {
    expect(filterUnwatched(episodes, false)).toEqual(episodes);
  });

  it("drops episodes marked Played when unwatchedOnly is true", () => {
    expect(filterUnwatched(episodes, true).map((e) => e.Id)).toEqual(["b", "c"]);
  });

  it("treats missing UserData as unwatched", () => {
    expect(filterUnwatched([episode("only-unknown")], true)).toHaveLength(1);
  });
});
