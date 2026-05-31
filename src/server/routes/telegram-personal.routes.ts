import { Router } from "express";
import { telegramPersonalService } from "../services/telegram-personal.service";

const router = Router();

router.get("/status", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";
    res.json(await telegramPersonalService.getStatus(userId));
  } catch (err) { next(err); }
});

router.post("/start-qr", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";
    const { apiId, apiHash } = req.body as { apiId?: number; apiHash?: string };
    res.json(await telegramPersonalService.startQrFlow(userId, apiId ? Number(apiId) : undefined, apiHash));
  } catch (err) { next(err); }
});

router.get("/qr-status", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";
    res.json(await telegramPersonalService.getQrStatus(userId));
  } catch (err) { next(err); }
});

router.post("/submit-password", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";
    const { password } = req.body as { password: string };
    if (!password) {
      res.status(400).json({ error: "password required" });
      return;
    }
    res.json(await telegramPersonalService.submitPassword(userId, password));
  } catch (err) { next(err); }
});


router.post("/send-code", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";
    const { phoneNumber, apiId, apiHash } = req.body as { phoneNumber: string; apiId?: number; apiHash?: string };
    if (!phoneNumber) {
      res.status(400).json({ error: "phoneNumber required" });
      return;
    }
    res.json(await telegramPersonalService.sendCode(userId, phoneNumber, apiId ? Number(apiId) : undefined, apiHash));
  } catch (err) { next(err); }
});

router.post("/verify", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";
    const { code, password } = req.body as { code: string; password?: string };
    if (!code) { res.status(400).json({ error: "code required" }); return; }
    res.json(await telegramPersonalService.verify(userId, code, password));
  } catch (err) { next(err); }
});

router.post("/sync", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";
    res.json(await telegramPersonalService.sync(userId));
  } catch (err) { next(err); }
});

// Deep historical sync — fetches up to 200 dialogs × 200 messages each
router.post("/sync-history", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";
    res.json(await telegramPersonalService.sync(userId, { deep: true }));
  } catch (err) { next(err); }
});

router.delete("/disconnect", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";
    await telegramPersonalService.disconnect(userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
