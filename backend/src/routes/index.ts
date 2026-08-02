import { Router } from "express";
import { downloadRouter } from "./download.routes";
import { imageRouter } from "./image.routes";
import { librariesRouter } from "./libraries.routes";
import { moviesRouter } from "./movies.routes";
import { searchRouter } from "./search.routes";
import { showsRouter } from "./shows.routes";

export const apiRouter = Router();

apiRouter.use(librariesRouter);
apiRouter.use(moviesRouter);
apiRouter.use(showsRouter);
apiRouter.use(searchRouter);
apiRouter.use(downloadRouter);
apiRouter.use(imageRouter);
