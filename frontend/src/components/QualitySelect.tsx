import type { TranscodeQuality } from "@shared/types";

interface QualitySelectProps {
  value: TranscodeQuality;
  onChange: (value: TranscodeQuality) => void;
  className?: string;
}

/** Always visible, never gated on login — unlike "Unwatched only", quality has nothing to do with watch state. */
export function QualitySelect({ value, onChange, className = "" }: QualitySelectProps) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as TranscodeQuality)}
      onClick={(event) => event.stopPropagation()}
      aria-label="Download quality"
      className={`rounded-md border border-neutral-700 bg-[var(--color-jelly-surface)] px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-[var(--color-jelly-accent)] ${className}`}
    >
      <option value="original">Original</option>
      <option value="1080p">1080p</option>
      <option value="720p">720p</option>
      <option value="480p">480p</option>
      <option value="360p">360p</option>
    </select>
  );
}
