export {};

declare global {
  namespace Express {
    interface Request {
      /** Set by the attachUser middleware when the session cookie resolves to a live session. */
      jellydropUser?: { id: string; name: string };
    }
  }
}
