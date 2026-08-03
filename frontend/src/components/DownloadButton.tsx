import { useEffect, useRef, useState } from "react";
import type { TranscodeQuality } from "@shared/types";

interface DownloadButtonProps {
  label?: string;
  /** Called with the chosen quality — "original" for a plain click, or whichever quality was picked
   *  from the attached dropdown. The caller owns building the actual download/enqueue for that quality. */
  onDownload: (quality: TranscodeQuality) => void;
  disabled?: boolean;
  className?: string;
  /** "primary" (default): filled accent button, for the main download action. "secondary": outlined,
   *  for a less prominent alternative action alongside a primary one (e.g. "As ZIP"). */
  variant?: "primary" | "secondary";
}

const QUALITY_OPTIONS: Array<{ value: TranscodeQuality; label: string }> = [
  { value: "original", label: "Original" },
  { value: "1080p", label: "1080p" },
  { value: "720p", label: "720p" },
  { value: "480p", label: "480p" },
  { value: "360p", label: "360p" },
];

/**
 * A "Download" button with a transcode-quality menu attached directly to it (a split button): the
 * main part downloads at the original quality on a plain click, and the small caret opens a
 * dropdown of quality options — picking one downloads immediately at that quality, no separate step.
 */
export function DownloadButton({
  label = "Download",
  onDownload,
  disabled = false,
  className = "",
  variant = "primary",
}: DownloadButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonColors =
    variant === "primary"
      ? "bg-[var(--color-jelly-accent)] text-white hover:bg-[var(--color-jelly-accent-hover)]"
      : "text-neutral-200 hover:bg-neutral-800";
  const dividerColor = variant === "primary" ? "border-black/25" : "border-neutral-700";
  const containerBorder = variant === "secondary" ? "border border-neutral-700" : "";

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function choose(event: React.MouseEvent, quality: TranscodeQuality) {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    onDownload(quality);
  }

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <div className={`inline-flex overflow-hidden rounded-md ${containerBorder}`}>
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => choose(event, "original")}
          className={`px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${buttonColors}`}
        >
          {label}
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label="Choose download quality"
          aria-expanded={open}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen((value) => !value);
          }}
          className={`border-l px-1.5 py-1.5 transition-colors disabled:opacity-50 ${buttonColors} ${dividerColor}`}
        >
          <svg width="10" height="10" viewBox="0 0 10 6" fill="none" aria-hidden="true">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-28 overflow-hidden rounded-md border border-neutral-700 bg-[var(--color-jelly-surface)] shadow-xl">
          {QUALITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={(event) => choose(event, option.value)}
              className="block w-full px-3 py-1.5 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
