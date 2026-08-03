import { useState } from "react";
import type { TranscodeQuality } from "@shared/types";
import { movieDownloadUrl, queueId } from "../api/client";
import { DownloadButton } from "./DownloadButton";
import { PosterCard } from "./PosterCard";
import { QualitySelect } from "./QualitySelect";
import { WatchedBadge } from "./WatchedBadge";

interface MoviePosterCardProps {
  id: string;
  name: string;
  year: number | null;
  posterUrl: string;
  /** Omit entirely on pages that don't otherwise show watched status (e.g. library browsing, search). */
  watched?: boolean | null;
  /** DOM id for the alphabet jump nav's scroll target — only Movies.tsx uses this. */
  jumpId?: string;
}

/** A movie poster with its own quality selector — each card owns its own choice independently. */
export function MoviePosterCard({ id, name, year, posterUrl, watched, jumpId }: MoviePosterCardProps) {
  const [quality, setQuality] = useState<TranscodeQuality>("original");

  return (
    <PosterCard
      id={jumpId}
      to={`/movies/${id}`}
      posterUrl={posterUrl}
      title={name}
      subtitle={year ? String(year) : undefined}
      badge={watched ? <WatchedBadge /> : undefined}
      action={
        <div className="flex items-center gap-1.5">
          <QualitySelect value={quality} onChange={setQuality} />
          <DownloadButton id={queueId(id, quality)} name={name} downloadUrl={movieDownloadUrl(id, quality)} />
        </div>
      }
    />
  );
}
