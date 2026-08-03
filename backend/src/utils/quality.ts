import type { TranscodeQuality } from "@shared/types";

const VALID_QUALITIES: TranscodeQuality[] = ["1080p", "720p", "480p", "360p"];

/** Anything other than an exact known quality string is treated as "original" — never throws on a bad/stale query param. */
export function parseQuality(raw: unknown): TranscodeQuality {
  return VALID_QUALITIES.includes(raw as TranscodeQuality) ? (raw as TranscodeQuality) : "original";
}
