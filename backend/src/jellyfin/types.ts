/**
 * Minimal shapes for the Jellyfin fields this app actually reads.
 * Deliberately excludes MediaSources/MediaStreams — those carry absolute
 * filesystem paths and must never be requested from Jellyfin nor forwarded.
 */

export interface JellyfinVirtualFolder {
  Name: string;
  CollectionType?: string;
  ItemId: string;
  Locations: string[];
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
}

export interface JellyfinItemsResponse {
  Items: JellyfinItem[];
  TotalRecordCount: number;
  StartIndex: number;
}
