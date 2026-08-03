import { useState } from "react";
import { ALPHABET_JUMP_LETTERS, letterBucket } from "../utils/alphabet";

interface JumpableItem {
  id: string;
  name: string;
}

interface UseAlphabetJumpOptions<T extends JumpableItem> {
  items: T[];
  total: number;
  /** Returns the newly-fetched page (see usePaginatedItems) — an empty array means nothing left to load. */
  loadMore: () => Promise<T[]>;
}

function findFirstAtOrAfter(list: JumpableItem[], letterIndex: number): JumpableItem | undefined {
  return list.find((item) => ALPHABET_JUMP_LETTERS.indexOf(letterBucket(item.name)) >= letterIndex);
}

/**
 * Jumps to the first item at (or, if nothing matches exactly, just after) a given letter. The
 * lists this is used on are already sorted alphabetically server-side but only loaded a page at a
 * time, so this loads additional pages on demand until the target is found or the list is
 * exhausted, then scrolls the matching element into view.
 */
export function useAlphabetJump<T extends JumpableItem>({ items, total, loadMore }: UseAlphabetJumpOptions<T>) {
  const [jumping, setJumping] = useState(false);

  async function jumpTo(letter: string) {
    const letterIndex = ALPHABET_JUMP_LETTERS.indexOf(letter);
    if (letterIndex === -1 || jumping) return;

    setJumping(true);
    try {
      let known: JumpableItem[] = items;
      let target = findFirstAtOrAfter(known, letterIndex);
      while (!target && known.length < total) {
        const newPage = await loadMore();
        if (newPage.length === 0) break;
        known = [...known, ...newPage];
        target = findFirstAtOrAfter(known, letterIndex);
      }
      if (target) {
        const targetId = target.id;
        requestAnimationFrame(() => {
          document.getElementById(`jump-${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    } finally {
      setJumping(false);
    }
  }

  return { jumpTo, jumping };
}
