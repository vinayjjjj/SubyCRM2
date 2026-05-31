import type { NextFunction, Request, Response } from "express";
import type { IncomingHttpHeaders } from "http";
import { auth } from "../lib/auth";

function toWebHeaders(headers: IncomingHttpHeaders): Headers {
  const webHeaders = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) webHeaders.append(key, item);
    } else if (value !== undefined) {
      webHeaders.set(key, String(value));
    }
  }

  return webHeaders;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({
      headers: toWebHeaders(req.headers),
    });

    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    res.locals.session = session;
    next();
  } catch (err) {
    next(err);
  }
}
