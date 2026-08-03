import { Router } from "express";
import { downloadRouter } from "./download.routes";
import { imageRouter } from "./image.routes";
import { librariesRouter } from "./libraries.routes";
import { meRouter } from "./me.routes";
import { moviesRouter } from "./movies.routes";
import { searchRouter } from "./search.routes";
import { showsRouter } from "./shows.routes";

/** Everything gated by requireAuthIfConfigured in app.ts — i.e. everything except /api/auth/*,
 *  /api/image/*, and /healthz. Images are mounted separately in app.ts so they can sit behind a
 *  much more generous rate limit — a single poster grid page can fire ~100 of these at once. */
export const apiRouter = Router();

apiRouter.use(librariesRouter);
apiRouter.use(moviesRouter);
apiRouter.use(showsRouter);
apiRouter.use(searchRouter);
apiRouter.use(downloadRouter);
apiRouter.use(meRouter);

export { authRouter } from "./auth.routes";
export { healthRouter } from "./health.routes";
export { imageRouter } from "./image.routes";
