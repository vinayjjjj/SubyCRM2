import { Router } from "express";
import { prisma } from "../lib/prisma";
import { contactService } from "../services/contact.service";
import { importService } from "../services/import.service";
import { telegramPersonalService } from "../services/telegram-personal.service";
import { discordService } from "../services/discord.service";
import { whatsappService } from "../services/whatsapp.service";

const router = Router();

// On startup: mark any orphaned "running" jobs as failed (they were interrupted by a server restart)
prisma.importJob.updateMany({
  where: { status: "running" },
  data: { status: "failed", errorLog: { error: "Interrupted by server restart" }, completedAt: new Date() },
}).catch(() => {});

// GET /api/imports — list all import jobs
router.get("/", async (_req, res, next) => {
  try {
    const jobs = await prisma.importJob.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(jobs);
  } catch (err) {
    next(err);
  }
});

// GET /api/imports/:id — single import job
router.get("/:id", async (req, res, next) => {
  try {
    const job = await prisma.importJob.findUnique({
      where: { id: req.params.id },
    });
    if (!job) {
      res.status(404).json({ error: "Import job not found" });
      return;
    }
    res.json(job);
  } catch (err) {
    next(err);
  }
});

// POST /api/imports/manual — manually create a contact via import flow
router.post("/manual", async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Missing name" });
      return;
    }

    // Create an import job record
    const job = await prisma.importJob.create({
      data: {
        source: "manual",
        status: "completed",
        totalFound: 1,
        imported: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    // Create the contact
    const contact = await contactService.create(req.body);

    res.status(201).json({ job, contact });
  } catch (err) {
    next(err);
  }
});

// POST /api/imports/beeper — trigger Beeper import
router.post("/beeper", async (_req, res, next) => {
  try {
    const job = await prisma.importJob.create({
      data: { source: "beeper", status: "running", startedAt: new Date() },
    });
    res.json({ status: "started", jobId: job.id });
    importService.runBeeperImport(job.id).catch(console.error);
  } catch (err) {
    next(err);
  }
});

// POST /api/imports/telegram — import contacts from Telegram MTProto dialogs
router.post("/telegram", async (req, res, next) => {
  try {
    // Use first authenticated user from session table
    const session = await (prisma as any).telegramPersonalSession.findFirst({
      where: { connected: true },
      select: { userId: true },
    });
    if (!session) {
      res.status(400).json({ error: "Telegram personal not connected. Connect it in Settings first." });
      return;
    }

    const job = await prisma.importJob.create({
      data: { source: "telegram_api", status: "running", startedAt: new Date() },
    });

    res.json({ status: "started", jobId: job.id });

    // Run in background
    telegramPersonalService.importContacts(session.userId)
      .then(async ({ imported, updated, skipped }) => {
        await prisma.importJob.update({
          where: { id: job.id },
          data: {
            status: "completed",
            totalFound: imported + updated + skipped,
            imported,
            deduplicated: updated,
            errors: skipped,
            completedAt: new Date(),
          },
        });
      })
      .catch(async (err) => {
        console.error("[import/telegram]", err);
        await prisma.importJob.update({
          where: { id: job.id },
          data: { status: "failed", errorLog: { error: err.message }, completedAt: new Date() },
        });
      });
  } catch (err) {
    next(err);
  }
});

// POST /api/imports/discord — import contacts from Discord servers
router.post("/discord", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";

    // Check connection status
    const status = await discordService.getStatus(userId);
    if (!status.connected) {
      res.status(400).json({ error: "Discord not connected. Connect it in Settings first." });
      return;
    }

    const job = await prisma.importJob.create({
      data: { source: "discord_api", status: "running", startedAt: new Date() },
    });

    res.json({ status: "started", jobId: job.id });

    // Run in background
    discordService.importContacts(userId)
      .then(async ({ imported, updated, skipped }) => {
        await prisma.importJob.update({
          where: { id: job.id },
          data: {
            status: "completed",
            totalFound: imported + updated + skipped,
            imported,
            deduplicated: updated,
            errors: skipped,
            completedAt: new Date(),
          },
        });
      })
      .catch(async (err) => {
        console.error("[import/discord]", err);
        await prisma.importJob.update({
          where: { id: job.id },
          data: { status: "failed", errorLog: { error: err.message }, completedAt: new Date() },
        });
      });
  } catch (err) {
    next(err);
  }
});

// POST /api/imports/whatsapp — import contacts from WhatsApp
router.post("/whatsapp", async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id ?? "default";

    // Check connection status
    const status = await whatsappService.getStatus(userId);
    if (!status.connected) {
      res.status(400).json({ error: "WhatsApp not connected. Connect it in Settings first." });
      return;
    }

    const job = await prisma.importJob.create({
      data: { source: "whatsapp_export", status: "running", startedAt: new Date() },
    });

    res.json({ status: "started", jobId: job.id });

    // Run in background
    whatsappService.importContacts(userId)
      .then(async ({ imported, updated, skipped }) => {
        await prisma.importJob.update({
          where: { id: job.id },
          data: {
            status: "completed",
            totalFound: imported + updated + skipped,
            imported,
            deduplicated: updated,
            errors: skipped,
            completedAt: new Date(),
          },
        });
      })
      .catch(async (err) => {
        console.error("[import/whatsapp]", err);
        await prisma.importJob.update({
          where: { id: job.id },
          data: { status: "failed", errorLog: { error: err.message }, completedAt: new Date() },
        });
      });
  } catch (err) {
    next(err);
  }
});

export default router;
