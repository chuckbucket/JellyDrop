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

/** Appended to a filename's base (before the extension) when the file was actually transcoded, so
 *  a saved file is self-descriptive about not being the original — e.g. "Movie (2020) (Transcoded 720p).mkv". */
function withTranscodedSuffix(base: string, transcodedQuality?: string): string {
  return transcodedQuality ? `${base} (Transcoded ${transcodedQuality})` : base;
}

export function buildMovieFilename(name: string, year: number | null, container: string, transcodedQuality?: string): string {
  const base = year ? `${name} (${year})` : name;
  return `${sanitizeFilenameComponent(withTranscodedSuffix(base, transcodedQuality))}.${primaryExtension(container)}`;
}

export function buildZipFilename(name: string): string {
  return `${sanitizeFilenameComponent(name)}.zip`;
}

export function buildEpisodeFilename(
  seriesName: string,
  seasonNumber: number | null,
  episodeNumber: number | null,
  episodeName: string,
  container: string,
  transcodedQuality?: string
): string {
  const season = seasonNumber !== null ? String(seasonNumber).padStart(2, "0") : "00";
  const episode = episodeNumber !== null ? String(episodeNumber).padStart(2, "0") : "00";
  const base = `${seriesName} - S${season}E${episode} - ${episodeName}`;
  return `${sanitizeFilenameComponent(withTranscodedSuffix(base, transcodedQuality))}.${primaryExtension(container)}`;
}
