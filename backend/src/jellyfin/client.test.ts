import { afterEach, describe, expect, it, vi } from "vitest";
import { jellyfinClient } from "./client";

describe("streamTranscodedProxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests Jellyfin's transcode-stream endpoint with the expected forcing params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await jellyfinClient.streamTranscodedProxy("item-1", 720, 2_500_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    const url = new URL(calledUrl as string);

    expect(url.pathname).toBe("/Videos/item-1/stream");
    expect(url.searchParams.get("static")).toBe("false");
    expect(url.searchParams.get("container")).toBe("mkv");
    expect(url.searchParams.get("videoCodec")).toBe("h264");
    expect(url.searchParams.get("audioCodec")).toBe("aac");
    expect(url.searchParams.get("maxHeight")).toBe("720");
    expect(url.searchParams.get("videoBitRate")).toBe("2500000");
    expect(url.searchParams.get("deviceId")).toBe("jellydrop");
    expect(url.searchParams.get("playSessionId")).toBeTruthy();
    expect((calledInit as RequestInit).headers).toMatchObject({ "X-Emby-Token": "test-api-key" });
  });

  it("uses a fresh playSessionId per call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await jellyfinClient.streamTranscodedProxy("item-1", 480, 1_200_000);
    await jellyfinClient.streamTranscodedProxy("item-1", 480, 1_200_000);

    const sessionIds = fetchMock.mock.calls.map(([url]) => new URL(url as string).searchParams.get("playSessionId"));
    expect(sessionIds[0]).not.toBe(sessionIds[1]);
  });
});
