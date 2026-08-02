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
  Overview?: string;
  MediaSources?: JellyfinMediaSource[];
}

export interface JellyfinItemsResponse {
  Items: JellyfinItem[];
  TotalRecordCount: number;
  StartIndex: number;
}
