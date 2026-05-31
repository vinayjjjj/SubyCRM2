import { Router } from "express";
import { discordService } from "../services/discord.service";

const router = Router();

// Unauthenticated callback — must be registered before requireAuth in index.ts
export const discordCallbackRouter = Router();
discordCallbackRouter.get("/callback", async (req, res) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  if (error || !code || !state) {
    console.error("[discord-callback] error from Discord:", error);
    res.redirect(discordService.callbackErrorRedirect);
    return;
  }
  try {
    await discordService.handleCallback(code, state);
    res.redirect(discordService.callbackRedirect);
  } catch (err) {
    console.error("[discord-callback]", err);
    res.redirect(discordService.callbackErrorRedirect);
  }
});

router.get("/connect-url", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";
    const url = discordService.buildAuthUrl(userId);
    res.json({ url });
  } catch (err) { next(err); }
});

router.get("/status", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";
    res.json(await discordService.getStatus(userId));
  } catch (err) { next(err); }
});

router.post("/connect", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";
    const { botToken } = req.body as { botToken: string };
    if (!botToken) { res.status(400).json({ error: "botToken required" }); return; }
    // Legacy manual token flow (fallback)
    const result = await discordService.legacyConnect(userId, botToken);
    res.json({ connected: true, ...result });
  } catch (err) { next(err); }
});

router.post("/sync", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";
    res.json(await discordService.sync(userId));
  } catch (err) { next(err); }
});

router.delete("/disconnect", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";
    await discordService.disconnect(userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
