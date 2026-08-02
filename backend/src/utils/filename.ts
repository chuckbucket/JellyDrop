/** Builds clean, sanitized download filenames from Jellyfin metadata — never from the original file path. */

function sanitizeFilenameComponent(input: string): string {
  return input
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Jellyfin sometimes reports multiple containers for one item (e.g. "mkv,webm") — the actual download is always one file. */
function primaryExtension(container: string): string {
  return container.split(",")[0].trim();
}

export function buildMovieFilename(name: string, year: number | null, container: string): string {
  const base = year ? `${name} (${year})` : name;
  return `${sanitizeFilenameComponent(base)}.${primaryExtension(container)}`;
}

export function buildEpisodeFilename(
  seriesName: string,
  seasonNumber: number | null,
  episodeNumber: number | null,
  episodeName: string,
  container: string
): string {
  const season = seasonNumber !== null ? String(seasonNumber).padStart(2, "0") : "00";
  const episode = episodeNumber !== null ? String(episodeNumber).padStart(2, "0") : "00";
  const base = `${seriesName} - S${season}E${episode} - ${episodeName}`;
  return `${sanitizeFilenameComponent(base)}.${primaryExtension(container)}`;
}
