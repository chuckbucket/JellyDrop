import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import * as moviesService from "../services/movies.service";

export const moviesRouter = Router();

/** Also accepts ?ids= for single-movie lookups, so the movie detail page can reuse this route. */
moviesRouter.get(
  "/movies",
  asyncHandler(async (req, res) => {
    const libraryId = typeof req.query.libraryId === "string" ? req.query.libraryId : undefined;
    const ids = typeof req.query.ids === "string" ? req.query.ids.split(",").filter(Boolean) : undefined;
    const startIndex = Number(req.query.startIndex) || 0;
    const limit = Number(req.query.limit) || 100;
    res.json(await moviesService.getMovies({ libraryId, ids, startIndex, limit }));
  })
);
