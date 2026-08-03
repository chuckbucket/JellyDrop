import type { EpisodeDTO, TranscodeQuality } from "@shared/types";
import { episodeDownloadUrl, queueId } from "../api/client";
import { useDownloadQueue } from "../context/DownloadQueueContext";
import { formatBytes } from "../utils/format";
import { DownloadButton } from "./DownloadButton";
import { WatchedBadge } from "./WatchedBadge";

interface EpisodeRowProps {
  episode: EpisodeDTO;
}

export function EpisodeRow({ episode }: EpisodeRowProps) {
  const { enqueue } = useDownloadQueue();
  const label = episode.indexNumber !== null ? `${episode.indexNumber}. ${episode.name}` : episode.name;
  const metaParts = [episode.resolution, episode.sizeBytes !== null ? formatBytes(episode.sizeBytes) : null].filter(
    (part): part is string => part !== null
  );

  function handleDownload(quality: TranscodeQuality) {
    enqueue([{ id: queueId(episode.id, quality), name: episode.name, downloadUrl: episodeDownloadUrl(episode.id, quality) }]);
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-[var(--color-jelly-surface)] px-4 py-3">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-neutral-100">{label}</p>
          {episode.watched && <WatchedBadge />}
        </div>
        {metaParts.length > 0 && <p className="text-sm text-neutral-400">{metaParts.join(" · ")}</p>}
      </div>
      <DownloadButton label="Download Episode" onDownload={handleDownload} />
    </div>
  );
}
