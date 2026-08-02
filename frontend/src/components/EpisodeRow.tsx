import type { EpisodeDTO } from "@shared/types";
import { episodeDownloadUrl } from "../api/client";
import { DownloadButton } from "./DownloadButton";

interface EpisodeRowProps {
  episode: EpisodeDTO;
}

export function EpisodeRow({ episode }: EpisodeRowProps) {
  const label = episode.indexNumber !== null ? `${episode.indexNumber}. ${episode.name}` : episode.name;
  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-[var(--color-jelly-surface)] px-4 py-3">
      <p className="text-neutral-100">{label}</p>
      <DownloadButton
        id={episode.id}
        name={episode.name}
        downloadUrl={episodeDownloadUrl(episode.id)}
        label="Download Episode"
      />
    </div>
  );
}
