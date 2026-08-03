import { useEffect, useRef, useState } from "react";
import type { SizeOption, TranscodeQuality } from "@shared/types";
import { formatBytes } from "../utils/format";

interface DownloadButtonProps {
  label?: string;
  /** Called with the chosen quality — "original" for a plain click, or whichever size tier was
   *  picked from the attached dropdown. The caller owns building the actual download/enqueue. */
  onDownload: (quality: TranscodeQuality) => void;
  /** Pre-computed, per-item selectable size-reduction tiers (small→large) — never includes an
   *  option that wouldn't actually shrink the file. Empty means the source is already small enough
   *  that no tier would help, in which case no dropdown is shown at all. */
  sizeOptions: SizeOption[];
  disabled?: boolean;
  className?: string;
  /** "primary" (default): filled accent button, for the main download action. "secondary": outlined,
   *  for a less prominent alternative action alongside a primary one (e.g. "As ZIP"). */
  variant?: "primary" | "secondary";
}

/**
 * A "Download" button with a size-reduction menu attached directly to it (a split button): the
 * main part downloads the original file on a plain click, and — only when there's actually
 * something smaller to offer — a caret opens a dropdown of estimated download sizes, each of which
 * downloads immediately at that size when picked.
 */
export function DownloadButton({
  label = "Download",
  onDownload,
  sizeOptions,
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
  const hasOptions = sizeOptions.length > 0;

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
    <div ref={rootRef} className={`relative inline-flex items-center gap-1.5 ${className}`}>
      <div className={`inline-flex overflow-hidden rounded-md ${containerBorder}`}>
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => choose(event, "original")}
          className={`px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${buttonColors}`}
        >
          {label}
        </button>
        {hasOptions && (
          <button
            type="button"
            disabled={disabled}
            aria-label="Choose a smaller download size"
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
        )}
      </div>
      {!hasOptions && <span className="text-xs text-neutral-500">Already small</span>}
      {open && hasOptions && (
        <div className="absolute right-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-md border border-neutral-700 bg-[var(--color-jelly-surface)] shadow-xl">
          {sizeOptions.map((option) => (
            <button
              key={option.quality}
              type="button"
              onClick={(event) => choose(event, option.quality)}
              className="block w-full px-3 py-1.5 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
            >
              ~{formatBytes(option.estimatedBytes)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
