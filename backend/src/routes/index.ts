import { Router } from "express";
import { downloadRouter } from "./download.routes";
import { imageRouter } from "./image.routes";
import { librariesRouter } from "./libraries.routes";
import { meRouter } from "./me.routes";
import { moviesRouter } from "./movies.routes";
import { searchRouter } from "./search.routes";
import { showsRouter } from "./shows.routes";

/** Everything gated by requireAuthIfConfigured in app.ts — i.e. everything except /api/auth/* and /healthz. */
export const apiRouter = Router();

apiRouter.use(librariesRouter);
apiRouter.use(moviesRouter);
apiRouter.use(showsRouter);
apiRouter.use(searchRouter);
apiRouter.use(downloadRouter);
apiRouter.use(imageRouter);
apiRouter.use(meRouter);

export { authRouter } from "./auth.routes";
export { healthRouter } from "./health.routes";
