import type { TranscodeQuality } from "@shared/types";

const VALID_QUALITIES: TranscodeQuality[] = ["small", "medium", "large"];

/** Anything other than an exact known quality string is treated as "original" — never throws on a bad/stale query param. */
export function parseQuality(raw: unknown): TranscodeQuality {
  return VALID_QUALITIES.includes(raw as TranscodeQuality) ? (raw as TranscodeQuality) : "original";
}
