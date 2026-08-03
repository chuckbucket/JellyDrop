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

function cornerLabel(resolution?: string | null, sizeBytes?: number | null): string | null {
  const parts = [resolution ?? null, sizeBytes != null ? formatBytes(sizeBytes) : null].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
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
