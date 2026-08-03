import { Router } from "express";
import { jellyfinClient } from "../jellyfin/client";
import { asyncHandler } from "../middleware/asyncHandler";
import * as downloadService from "../services/download.service";
import { pipeJellyfinResponse } from "../utils/stream";

export const downloadRouter = Router();

downloadRouter.get(
  "/download/movie/:id",
  asyncHandler(async (req, res) => {
    const filename = await downloadService.getMovieFilename(req.params.id);
    if (!filename) {
      res.status(404).json({ error: "Movie not found" });
      return;
    }
    const jfRes = await jellyfinClient.streamProxy(`/Items/${req.params.id}/Download`, req.headers.range);
    pipeJellyfinResponse(res, jfRes, { filename });
  })
);

downloadRouter.get(
  "/download/episode/:id",
  asyncHandler(async (req, res) => {
    const filename = await downloadService.getEpisodeFilename(req.params.id);
    if (!filename) {
      res.status(404).json({ error: "Episode not found" });
      return;
    }
    const jfRes = await jellyfinClient.streamProxy(`/Items/${req.params.id}/Download`, req.headers.range);
    pipeJellyfinResponse(res, jfRes, { filename });
  })
);

downloadRouter.get(
  "/download/season/:id",
  asyncHandler(async (req, res) => {
    const manifest = await downloadService.getSeasonManifest(req.params.id);
    if (!manifest) {
      res.status(404).json({ error: "Season not found" });
      return;
    }
    res.json(manifest);
  })
);

downloadRouter.get(
  "/download/show/:id",
  asyncHandler(async (req, res) => {
    res.json(await downloadService.getShowManifest(req.params.id));
  })
);

downloadRouter.get(
  "/download/season/:id/zip",
  asyncHandler(async (req, res) => {
    const found = await downloadService.streamSeasonZip(res, req.params.id);
    if (!found) res.status(404).json({ error: "Season not found" });
  })
);

downloadRouter.get(
  "/download/show/:id/zip",
  asyncHandler(async (req, res) => {
    const found = await downloadService.streamShowZip(res, req.params.id);
    if (!found) res.status(404).json({ error: "Series not found" });
  })
);
