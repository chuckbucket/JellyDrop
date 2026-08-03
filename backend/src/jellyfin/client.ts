import { randomUUID } from "node:crypto";
import { config } from "../config";
import type { JellyfinItem, JellyfinItemsResponse, JellyfinPublicUser, JellyfinVirtualFolder } from "./types";

export class JellyfinApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

type QueryParams = Record<string, string | number | undefined>;

/** Thin wrapper around the Jellyfin REST API. Server-side only — the API key never leaves this module. */
class JellyfinClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  private authHeaders(): Record<string, string> {
    return { "X-Emby-Token": this.apiKey };
  }

  private buildUrl(path: string, params?: QueryParams): string {
    const url = new URL(this.baseUrl + path);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async getJson<T>(path: string, params?: QueryParams): Promise<T> {
    const res = await fetch(this.buildUrl(path, params), { headers: this.authHeaders() });
    if (!res.ok) {
      throw new JellyfinApiError(res.status, `Jellyfin request failed: ${path} (${res.status})`);
    }
    return (await res.json()) as T;
  }

  async getVirtualFolders(): Promise<JellyfinVirtualFolder[]> {
    return this.getJson<JellyfinVirtualFolder[]>("/Library/VirtualFolders");
  }

  /**
   * The same "who's logging in" list Jellyfin's own login screen shows before any credentials are
   * entered — lets the login form offer a picker instead of requiring the username to be typed.
   * Jellyfin excludes hidden users from this list on its own; an admin can also disable it
   * server-wide, in which case it just comes back empty and the frontend falls back to a typed form.
   */
  async getPublicUsers(): Promise<JellyfinPublicUser[]> {
    return this.getJson<JellyfinPublicUser[]>("/Users/Public");
  }

  async getItems(params: QueryParams): Promise<JellyfinItemsResponse> {
    return this.getJson<JellyfinItemsResponse>("/Items", params);
  }

  async getItemsByIds(ids: string[], fields: string[], userId?: string): Promise<JellyfinItem[]> {
    if (ids.length === 0) return [];
    const res = await this.getItems({ Ids: ids.join(","), Fields: fields.join(","), UserId: userId });
    return res.Items;
  }

  async getSeasons(seriesId: string, fields?: string[]): Promise<JellyfinItem[]> {
    const res = await this.getJson<JellyfinItemsResponse>(`/Shows/${seriesId}/Seasons`, {
      Fields: fields?.join(","),
    });
    return res.Items;
  }

  async getEpisodes(
    seriesId: string,
    options: { seasonId?: string; fields?: string[]; userId?: string } = {}
  ): Promise<JellyfinItem[]> {
    const res = await this.getJson<JellyfinItemsResponse>(`/Shows/${seriesId}/Episodes`, {
      seasonId: options.seasonId,
      Fields: options.fields?.join(","),
      UserId: options.userId,
    });
    return res.Items;
  }

  /** Streams a raw Jellyfin response through (used for /Download and /Images/Primary). Forwards Range for seek/resume support. */
  async streamProxy(path: string, incomingRange?: string): Promise<Response> {
    const headers: Record<string, string> = this.authHeaders();
    if (incomingRange) headers["Range"] = incomingRange;
    return fetch(this.buildUrl(path), { headers });
  }

  /**
   * Asks Jellyfin's own transcoder to re-encode an item down to `targetHeight` and stream the
   * result back as a single continuous file (not HLS segments) — the same progressive
   * transcode-to-a-stream endpoint real clients fall back to when they can't direct-play. Output
   * is always Matroska: it streams cleanly in one forward pass, unlike MP4's `moov`-atom concerns.
   * A random per-request `playSessionId`/fixed `deviceId` are only there because Jellyfin requires
   * them to identify the encoding job; there's no session lifecycle to manage beyond that —
   * Jellyfin tears down the ffmpeg process when the response connection closes, same as any other
   * ad-hoc stream. No Range support: a live transcode can't seek, so it's never forwarded here.
   */
  async streamTranscodedProxy(itemId: string, targetHeight: number, targetBitrateBps: number): Promise<Response> {
    const url = this.buildUrl(`/Videos/${itemId}/stream`, {
      static: "false",
      container: "mkv",
      videoCodec: "h264",
      audioCodec: "aac",
      maxHeight: targetHeight,
      videoBitRate: targetBitrateBps,
      deviceId: "jellydrop",
      playSessionId: randomUUID(),
    });
    return fetch(url, { headers: this.authHeaders() });
  }

  /**
   * Verifies real Jellyfin credentials and returns that user's identity — nothing else. The
   * AccessToken Jellyfin issues here is discarded on purpose: every other call this app makes
   * keeps using the shared admin API key, with `UserId` passed alongside it to get user-scoped
   * data (watched status, etc.), so there's no per-user token to manage or refresh.
   */
  async authenticateByName(username: string, password: string): Promise<{ id: string; name: string } | null> {
    const res = await fetch(this.buildUrl("/Users/AuthenticateByName"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Emby-Authorization":
          'MediaBrowser Client="JellyDrop", Device="JellyDrop", DeviceId="jellydrop-server", Version="1.0.0"',
      },
      body: JSON.stringify({ Username: username, Pw: password }),
    });
    if (res.status === 401) return null;
    if (!res.ok) {
      throw new JellyfinApiError(res.status, `Jellyfin authentication request failed (${res.status})`);
    }
    const body = (await res.json()) as { User: { Id: string; Name: string } };
    return { id: body.User.Id, name: body.User.Name };
  }
}

export const jellyfinClient = new JellyfinClient(config.jellyfinUrl, config.jellyfinApiKey);
