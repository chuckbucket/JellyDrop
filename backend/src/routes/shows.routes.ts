import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import * as showsService from "../services/shows.service";

export const showsRouter = Router();

showsRouter.get(
  "/shows",
  asyncHandler(async (req, res) => {
    const libraryId = typeof req.query.libraryId === "string" ? req.query.libraryId : undefined;
    const startIndex = Number(req.query.startIndex) || 0;
    const limit = Number(req.query.limit) || 100;
    res.json(await showsService.getShows({ libraryId, startIndex, limit }));
  })
);

showsRouter.get(
  "/show/:id",
  asyncHandler(async (req, res) => {
    const show = await showsService.getShowDetail(req.params.id);
    if (!show) {
      res.status(404).json({ error: "Show not found" });
      return;
    }
    res.json(show);
  })
);

showsRouter.get(
  "/season/:id",
  asyncHandler(async (req, res) => {
    const season = await showsService.getSeasonDetail(req.params.id);
    if (!season) {
      res.status(404).json({ error: "Season not found" });
      return;
    }
    res.json(season);
  })
);
