import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import * as downloadService from "../services/download.service";
import { parseQuality } from "../utils/quality";

export const downloadRouter = Router();

downloadRouter.get(
  "/download/movie/:id",
  asyncHandler(async (req, res) => {
    const found = await downloadService.streamMovie(res, req.params.id, {
      range: req.headers.range,
      quality: parseQuality(req.query.quality),
    });
    if (!found) res.status(404).json({ error: "Movie not found" });
  })
);

downloadRouter.get(
  "/download/episode/:id",
  asyncHandler(async (req, res) => {
    const found = await downloadService.streamEpisode(res, req.params.id, {
      range: req.headers.range,
      quality: parseQuality(req.query.quality),
    });
    if (!found) res.status(404).json({ error: "Episode not found" });
  })
);

downloadRouter.get(
  "/download/season/:id",
  asyncHandler(async (req, res) => {
    const manifest = await downloadService.getSeasonManifest(req.params.id, {
      userId: req.jellydropUser?.id,
      unwatchedOnly: req.query.unwatchedOnly === "true",
      quality: parseQuality(req.query.quality),
    });
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
    res.json(
      await downloadService.getShowManifest(req.params.id, {
        userId: req.jellydropUser?.id,
        unwatchedOnly: req.query.unwatchedOnly === "true",
        quality: parseQuality(req.query.quality),
      })
    );
  })
);

downloadRouter.get(
  "/download/season/:id/zip",
  asyncHandler(async (req, res) => {
    const found = await downloadService.streamSeasonZip(res, req.params.id, {
      userId: req.jellydropUser?.id,
      unwatchedOnly: req.query.unwatchedOnly === "true",
      quality: parseQuality(req.query.quality),
    });
    if (!found) res.status(404).json({ error: "Season not found" });
  })
);

downloadRouter.get(
  "/download/show/:id/zip",
  asyncHandler(async (req, res) => {
    const found = await downloadService.streamShowZip(res, req.params.id, {
      userId: req.jellydropUser?.id,
      unwatchedOnly: req.query.unwatchedOnly === "true",
      quality: parseQuality(req.query.quality),
    });
    if (!found) res.status(404).json({ error: "Series not found" });
  })
);
