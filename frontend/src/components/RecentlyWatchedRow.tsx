import { useEffect, useState } from "react";
import type { RecentlyWatchedItemDTO } from "@shared/types";
import { getRecentlyWatched } from "../api/client";
import { PosterCard } from "./PosterCard";

export function RecentlyWatchedRow() {
  const [items, setItems] = useState<RecentlyWatchedItemDTO[] | null>(null);

  useEffect(() => {
    getRecentlyWatched()
      .then((result) => setItems(result.items))
      .catch(() => setItems([]));
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="mb-3 text-xl font-semibold">Recently Watched</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {items.map((item) => (
          <div key={item.id} className="w-32 shrink-0 sm:w-36">
            <PosterCard
              to={`/shows/${item.id}`}
              posterUrl={item.posterUrl}
              title={item.name}
              subtitle={item.year ? String(item.year) : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
