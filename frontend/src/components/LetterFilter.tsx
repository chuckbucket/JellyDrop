import { ALPHABET_JUMP_LETTERS } from "../utils/alphabet";

interface LetterFilterProps {
  activeLetter: string | null;
  onSelect: (letter: string | null) => void;
  loading?: boolean;
}

function pillClassName(active: boolean): string {
  return `shrink-0 rounded px-1.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
    active ? "bg-[var(--color-jelly-accent)] text-white" : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
  }`;
}

/** "ALL" followed by "#" (titles starting with a digit/symbol) and A-Z — click a letter to filter
 *  the list down to just its matches, loading any remaining pages first if not all are loaded yet. */
export function LetterFilter({ activeLetter, onSelect, loading }: LetterFilterProps) {
  return (
    <div className="flex max-w-full flex-wrap gap-0.5" aria-label="Filter by starting letter">
      <button type="button" onClick={() => onSelect(null)} disabled={loading} className={pillClassName(activeLetter === null)}>
        ALL
      </button>
      {ALPHABET_JUMP_LETTERS.map((letter) => (
        <button key={letter} type="button" onClick={() => onSelect(letter)} disabled={loading} className={pillClassName(activeLetter === letter)}>
          {letter}
        </button>
      ))}
    </div>
  );
}
