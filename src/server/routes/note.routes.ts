import { Router } from "express";
import { prisma } from "../lib/prisma";
import { cache } from "../lib/cache";

// ─── Contact notes router (mounted at /api/contacts) ────────
export const contactNoteRouter = Router();

// POST /api/contacts/:id/notes — create a note
contactNoteRouter.post("/:id/notes", async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== "string") {
      res.status(400).json({ error: "Missing content" });
      return;
    }
    const note = await prisma.note.create({
      data: {
        contactId: req.params.id,
        content: content.trim(),
      },
    });
    await cache.invalidateContacts().catch(console.error);
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/contacts/:id/notes/:noteId — delete a note
contactNoteRouter.delete("/:id/notes/:noteId", async (req, res, next) => {
  try {
    await prisma.note.delete({ where: { id: req.params.noteId, contactId: req.params.id } });
    await cache.invalidateContacts().catch(console.error);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Notes router (mounted at /api/notes) ───────────────────
export const noteRouter = Router();

// DELETE /api/notes/:noteId — delete a note
noteRouter.delete("/:noteId", async (req, res, next) => {
  try {
    await prisma.note.delete({ where: { id: req.params.noteId } });
    await cache.invalidateContacts().catch(console.error);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
