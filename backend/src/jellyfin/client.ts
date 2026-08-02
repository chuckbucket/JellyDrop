import { config } from "../config";
import type { JellyfinItem, JellyfinItemsResponse, JellyfinVirtualFolder } from "./types";

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

  async getItems(params: QueryParams): Promise<JellyfinItemsResponse> {
    return this.getJson<JellyfinItemsResponse>("/Items", params);
  }

  async getItemsByIds(ids: string[], fields: string[]): Promise<JellyfinItem[]> {
    if (ids.length === 0) return [];
    const res = await this.getItems({ Ids: ids.join(","), Fields: fields.join(",") });
    return res.Items;
  }

  async getSeasons(seriesId: string): Promise<JellyfinItem[]> {
    const res = await this.getJson<JellyfinItemsResponse>(`/Shows/${seriesId}/Seasons`);
    return res.Items;
  }

  async getEpisodes(seriesId: string, options: { seasonId?: string; fields?: string[] } = {}): Promise<JellyfinItem[]> {
    const res = await this.getJson<JellyfinItemsResponse>(`/Shows/${seriesId}/Episodes`, {
      seasonId: options.seasonId,
      Fields: options.fields?.join(","),
    });
    return res.Items;
  }

  /** Streams a raw Jellyfin response through (used for /Download and /Images/Primary). Forwards Range for seek/resume support. */
  async streamProxy(path: string, incomingRange?: string): Promise<Response> {
    const headers: Record<string, string> = this.authHeaders();
    if (incomingRange) headers["Range"] = incomingRange;
    return fetch(this.buildUrl(path), { headers });
  }
}

export const jellyfinClient = new JellyfinClient(config.jellyfinUrl, config.jellyfinApiKey);
