import { Router } from "express";
import { jellyfinClient } from "../jellyfin/client";
import { asyncHandler } from "../middleware/asyncHandler";
import { pipeJellyfinResponse } from "../utils/stream";

export const imageRouter = Router();

/** Proxies poster images so the frontend never sees JELLYFIN_URL or the API key directly. */
imageRouter.get(
  "/image/:id",
  asyncHandler(async (req, res) => {
    const jfRes = await jellyfinClient.streamProxy(`/Items/${req.params.id}/Images/Primary`);
    pipeJellyfinResponse(res, jfRes, { cacheControl: "public, max-age=86400" });
  })
);
