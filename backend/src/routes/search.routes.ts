import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import * as searchService from "../services/search.service";

export const searchRouter = Router();

searchRouter.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    res.json(await searchService.search(q));
  })
);
