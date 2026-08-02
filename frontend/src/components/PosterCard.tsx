import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface PosterCardProps {
  to: string;
  posterUrl: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export function PosterCard({ to, posterUrl, title, subtitle, action }: PosterCardProps) {
  return (
    <Link to={to} className="group flex flex-col gap-2">
      <div className="relative aspect-2/3 overflow-hidden rounded-lg bg-neutral-800 shadow-md transition-transform duration-200 group-hover:scale-[1.03] group-hover:shadow-xl">
        <img src={posterUrl} alt={title} loading="lazy" className="h-full w-full object-cover" />
        {action && (
          <div className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/85 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
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
