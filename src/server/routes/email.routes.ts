import { Router } from "express";
import { sendEmail } from "../services/gmail.service";

export const emailRouter = Router();

// POST /api/email/send
// Expects JSON body: { to, subject, text?, html? }
emailRouter.post("/send", async (req, res, next) => {
  try {
    const { to, subject, text, html } = req.body;
    if (!to || !subject) {
      return res.status(400).json({ error: "Missing required fields: to, subject" });
    }
    const info = await sendEmail({ to, subject, text, html });
    res.json({ messageId: info.messageId, previewUrl: info.previewUrl || null });
  } catch (err) {
    console.error("[emailRouter] send error", err);
    next(err);
  }
});
