import { ALPHABET_JUMP_LETTERS } from "../utils/alphabet";

interface AlphabetJumpProps {
  onJump: (letter: string) => void;
  disabled?: boolean;
}

/** "#" (for titles starting with a number or symbol) followed by A-Z — click a letter to scroll to
 *  the first matching title, loading further pages first if it isn't loaded yet. */
export function AlphabetJump({ onJump, disabled }: AlphabetJumpProps) {
  return (
    <div className="flex max-w-full gap-0.5 overflow-x-auto" aria-label="Jump to letter">
      {ALPHABET_JUMP_LETTERS.map((letter) => (
        <button
          key={letter}
          type="button"
          onClick={() => onJump(letter)}
          disabled={disabled}
          className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-50"
        >
          {letter}
        </button>
      ))}
    </div>
  );
}
