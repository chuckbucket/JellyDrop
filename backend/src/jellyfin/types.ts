/**
 * Minimal shapes for the Jellyfin fields this app actually reads.
 *
 * MediaSources/MediaStreams are now requested (for file size + resolution), but Jellyfin's raw
 * response also carries absolute filesystem paths in there (MediaSources[].Path,
 * MediaStreams[].Path for subtitles). Those fields are deliberately left out of the types below
 * and must never be added — the mapper layer only ever plucks Size/Width/Height as bare numbers,
 * so a path can't leak through even by accident.
 */

export interface JellyfinVirtualFolder {
  Name: string;
  CollectionType?: string;
  ItemId: string;
  Locations: string[];
}

export interface JellyfinMediaStream {
  Type: string;
  Width?: number;
  Height?: number;
}

export interface JellyfinMediaSource {
  Size?: number;
  MediaStreams?: JellyfinMediaStream[];
}

export interface JellyfinUserData {
  Played?: boolean;
  LastPlayedDate?: string;
}

export interface JellyfinItem {
  Id: string;
  Name: string;
  Type: string;
  ProductionYear?: number;
  Container?: string;
  SeriesName?: string;
  SeriesId?: string;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  /** An episode's actual parent season id — Jellyfin can have more than one Season record sharing
   *  the same IndexNumber (e.g. after a library reorganization/rescan), so this is the only
   *  reliable way to tell which specific season record an episode really belongs to. */
  SeasonId?: string;
  Overview?: string;
  MediaSources?: JellyfinMediaSource[];
  /** Only populated when the request included a UserId — watched/resume state is per-user. */
  UserData?: JellyfinUserData;
  /** 100ns units. Used to estimate bitrate (Size / duration) for transcode skip-logic. */
  RunTimeTicks?: number;
}

export interface JellyfinItemsResponse {
  Items: JellyfinItem[];
  TotalRecordCount: number;
  StartIndex: number;
}

/** The subset of /Users/Public Jellyfin returns for the pre-login "who's logging in" picker. */
export interface JellyfinPublicUser {
  Id: string;
  Name: string;
  HasPassword: boolean;
  PrimaryImageTag?: string;
}
