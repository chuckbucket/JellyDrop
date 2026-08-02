import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import * as librariesService from "../services/libraries.service";
import * as moviesService from "../services/movies.service";
import * as showsService from "../services/shows.service";

export const librariesRouter = Router();

librariesRouter.get(
  "/libraries",
  asyncHandler(async (_req, res) => {
    res.json(await librariesService.getLibraries());
  })
);

librariesRouter.get(
  "/library/:id",
  asyncHandler(async (req, res) => {
    const library = await librariesService.getLibraryById(req.params.id);
    if (!library) {
      res.status(404).json({ error: "Library not found" });
      return;
    }

    const startIndex = Number(req.query.startIndex) || 0;
    const limit = Number(req.query.limit) || 100;

    const contents =
      library.type === "movies"
        ? await moviesService.getMovies({ libraryId: library.id, startIndex, limit })
        : await showsService.getShows({ libraryId: library.id, startIndex, limit });

    res.json({ library, ...contents });
  })
);
