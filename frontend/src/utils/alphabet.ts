/** "#" buckets anything that doesn't start with a letter (digits, symbols) — sorts before "A". */
export const ALPHABET_JUMP_LETTERS: readonly string[] = [
  "#",
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
];

const ARTICLE_PREFIXES = ["THE ", "AN ", "A "];

/** Approximates Jellyfin's SortName grouping (which the backend already sorts by) well enough to
 *  bucket a title for the jump nav without needing SortName itself on the wire. */
export function letterBucket(name: string): string {
  let normalized = name.trim().toUpperCase();
  for (const prefix of ARTICLE_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }
  const first = normalized.charAt(0);
  return first >= "A" && first <= "Z" ? first : "#";
}
