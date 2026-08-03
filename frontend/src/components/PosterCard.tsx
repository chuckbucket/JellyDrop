import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface PosterCardProps {
  to: string;
  posterUrl: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Small, always-visible top-left chip (e.g. a "Watched" mark) — unlike `action`, not hover-gated. */
  badge?: ReactNode;
  /** Small, always-visible bottom-left label (e.g. resolution/file size) — shares the same gradient
   *  bar as `action`, on the opposite side. */
  cornerLabel?: ReactNode;
  /** DOM id — used as a scroll target by the alphabet jump nav. */
  id?: string;
}

export function PosterCard({ to, posterUrl, title, subtitle, action, badge, cornerLabel, id }: PosterCardProps) {
  return (
    <Link id={id} to={to} className="group flex flex-col gap-2">
      <div className="relative aspect-2/3 overflow-hidden rounded-lg bg-neutral-800 shadow-md transition-transform duration-200 group-hover:scale-[1.03] group-hover:shadow-xl">
        <img src={posterUrl} alt={title} loading="lazy" className="h-full w-full object-cover" />
        {badge && <div className="absolute top-2 left-2">{badge}</div>}
        {/* Always visible, not hover-gated — hover has no equivalent on touchscreens, where the
            button would otherwise never appear. */}
        {(action || cornerLabel) && (
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent p-2">
            <div className="flex min-w-0 flex-col text-xs leading-tight font-medium text-neutral-200">{cornerLabel}</div>
            {action}
          </div>
        )}
      </div>
      <div>
        <p className="truncate text-sm font-medium text-neutral-100">{title}</p>
        {subtitle && <p className="text-xs text-neutral-400">{subtitle}</p>}
      </div>
    </Link>
  );
}
