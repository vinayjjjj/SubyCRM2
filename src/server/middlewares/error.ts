import { Request, Response, NextFunction } from "express";

export function errorMiddleware(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error("[Error]", err.stack || err.message);
  res.status(500).json({ error: err.message || "Internal server error" });
}
