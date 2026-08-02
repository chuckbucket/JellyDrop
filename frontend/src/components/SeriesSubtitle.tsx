import type { SeriesDTO } from "@shared/types";

/** Poster-card subtitle for a series: year, then season count and the first–last season year range. */
export function SeriesSubtitle({ series }: { series: SeriesDTO }) {
  const yearRange =
    series.firstSeasonYear && series.lastSeasonYear
      ? series.firstSeasonYear === series.lastSeasonYear
        ? String(series.firstSeasonYear)
        : `${series.firstSeasonYear}–${series.lastSeasonYear}`
      : null;

  return (
    <>
      {series.year && <span className="block">{series.year}</span>}
      <span className="block">
        {series.seasonCount} season{series.seasonCount === 1 ? "" : "s"}
        {yearRange && ` · ${yearRange}`}
      </span>
    </>
  );
}
