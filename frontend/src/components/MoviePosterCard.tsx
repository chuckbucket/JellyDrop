import type { ReactNode } from "react";
import type { TranscodeQuality } from "@shared/types";
import { movieDownloadUrl, queueId } from "../api/client";
import { useDownloadQueue } from "../context/DownloadQueueContext";
import { formatBytes } from "../utils/format";
import { DownloadButton } from "./DownloadButton";
import { PosterCard } from "./PosterCard";
import { WatchedBadge } from "./WatchedBadge";

interface MoviePosterCardProps {
  id: string;
  name: string;
  year: number | null;
  posterUrl: string;
  /** Omit entirely on pages that don't otherwise have this data (rare — see search.service.ts). */
  resolution?: string | null;
  sizeBytes?: number | null;
  /** Omit entirely on pages that don't otherwise show watched status (e.g. library browsing, search). */
  watched?: boolean | null;
  /** DOM id for the alphabet jump nav's scroll target — only Movies.tsx uses this. */
  jumpId?: string;
}

/** Resolution and file size on their own line each, rather than one joined string, so both stay readable at poster size. */
function cornerLabel(resolution?: string | null, sizeBytes?: number | null): ReactNode {
  if (!resolution && sizeBytes == null) return null;
  return (
    <>
      {resolution && <div className="truncate">{resolution}</div>}
      {sizeBytes != null && <div className="truncate">{formatBytes(sizeBytes)}</div>}
    </>
  );
}

/** A movie poster with a split download button (quality dropdown attached) and a resolution/size corner label. */
export function MoviePosterCard({ id, name, year, posterUrl, resolution, sizeBytes, watched, jumpId }: MoviePosterCardProps) {
  const { enqueue } = useDownloadQueue();

  function handleDownload(quality: TranscodeQuality) {
    enqueue([{ id: queueId(id, quality), name, downloadUrl: movieDownloadUrl(id, quality) }]);
  }

  return (
    <PosterCard
      id={jumpId}
      to={`/movies/${id}`}
      posterUrl={posterUrl}
      title={name}
      subtitle={year ? String(year) : undefined}
      badge={watched ? <WatchedBadge /> : undefined}
      cornerLabel={cornerLabel(resolution, sizeBytes)}
      action={<DownloadButton onDownload={handleDownload} />}
    />
  );
}
