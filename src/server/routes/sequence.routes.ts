import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// ── GET /api/sequences ────────────────────────────────────────────────────────
router.get("/", async (_req, res, next) => {
  try {
    const sequences = await (prisma as any).sequence.findMany({
      include: {
        steps: { orderBy: { stepNumber: "asc" } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(sequences);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/sequences/:id ────────────────────────────────────────────────────
router.get("/:id", async (req, res, next) => {
  try {
    const sequence = await (prisma as any).sequence.findUnique({
      where: { id: req.params.id },
      include: {
        steps: { orderBy: { stepNumber: "asc" } },
        enrollments: {
          include: {
            // contact relation will be accessible once Prisma schema is updated
          },
          orderBy: { enrolledAt: "desc" },
        },
      },
    });
    if (!sequence) {
      res.status(404).json({ error: "Sequence not found" });
      return;
    }
    res.json(sequence);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/sequences ───────────────────────────────────────────────────────
router.post("/", async (req, res, next) => {
  try {
    const { name, description, steps } = req.body as {
      name: string;
      description?: string;
      steps?: Array<{
        stepNumber: number;
        type: string;
        delayDays?: number;
        subject?: string;
        body?: string;
      }>;
    };

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const sequence = await (prisma as any).sequence.create({
      data: {
        name,
        description,
        steps: steps
          ? {
              create: steps.map((s) => ({
                stepNumber: s.stepNumber,
                type: s.type,
                delayDays: s.delayDays ?? 0,
                subject: s.subject,
                body: s.body,
              })),
            }
          : undefined,
      },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    });

    res.status(201).json(sequence);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/sequences/:id ──────────────────────────────────────────────────
router.patch("/:id", async (req, res, next) => {
  try {
    const { name, description, status } = req.body as {
      name?: string;
      description?: string;
      status?: string;
    };

    const sequence = await (prisma as any).sequence.update({
      where: { id: req.params.id },
      data: { name, description, status },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    });

    res.json(sequence);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/sequences/:id ─────────────────────────────────────────────────
router.delete("/:id", async (req, res, next) => {
  try {
    await (prisma as any).sequence.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── POST /api/sequences/:id/enroll ───────────────────────────────────────────
// Enroll a contact in a sequence
router.post("/:id/enroll", async (req, res, next) => {
  try {
    const { contactId } = req.body as { contactId: string };
    if (!contactId) {
      res.status(400).json({ error: "contactId is required" });
      return;
    }

    // Verify sequence and contact exist
    const [sequence, contact] = await Promise.all([
      (prisma as any).sequence.findUnique({
        where: { id: req.params.id },
        include: { steps: { orderBy: { stepNumber: "asc" }, take: 1 } },
      }),
      prisma.contact.findUnique({ where: { id: contactId }, select: { id: true, name: true } }),
    ]);

    if (!sequence) {
      res.status(404).json({ error: "Sequence not found" });
      return;
    }
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    // Compute first step due date
    const firstStep = sequence.steps[0];
    const nextStepDue = firstStep
      ? new Date(Date.now() + (firstStep.delayDays ?? 0) * 86400_000)
      : null;

    const enrollment = await (prisma as any).sequenceEnrollment.upsert({
      where: { sequenceId_contactId: { sequenceId: req.params.id, contactId } },
      create: {
        sequenceId: req.params.id,
        contactId,
        currentStep: 0,
        status: "active",
        nextStepDue,
      },
      update: {
        status: "active",
        currentStep: 0,
        nextStepDue,
        completedAt: null,
      },
    });

    res.status(201).json({ enrollment, contact });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/sequences/:id/enroll/:contactId ───────────────────────────────
// Remove a contact from a sequence (exit)
router.delete("/:id/enroll/:contactId", async (req, res, next) => {
  try {
    await (prisma as any).sequenceEnrollment.update({
      where: {
        sequenceId_contactId: {
          sequenceId: req.params.id,
          contactId: req.params.contactId,
        },
      },
      data: { status: "exited" },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── GET /api/sequences/:id/enrollments ────────────────────────────────────────
router.get("/:id/enrollments", async (req, res, next) => {
  try {
    const enrollments = await (prisma as any).sequenceEnrollment.findMany({
      where: { sequenceId: req.params.id },
      orderBy: { enrolledAt: "desc" },
    });
    res.json(enrollments);
  } catch (err) {
    next(err);
  }
});

export default router;
