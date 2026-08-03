import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireUser } from "../middleware/auth";
import * as recentlyWatchedService from "../services/recentlyWatched.service";

export const meRouter = Router();

meRouter.get(
  "/me/recently-watched",
  requireUser,
  asyncHandler(async (req, res) => {
    const items = await recentlyWatchedService.getRecentlyWatched(req.jellydropUser!.id);
    res.json({ items });
  })
);
