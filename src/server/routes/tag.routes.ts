import { Router } from "express";
import { prisma } from "../lib/prisma";
import { cache } from "../lib/cache";

// ─── Tag CRUD router (mounted at /api/tags) ─────────────────
export const tagRouter = Router();

// GET /api/tags — list all tags
tagRouter.get("/", async (_req, res, next) => {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { contactTags: true } } },
    });
    res.json(tags);
  } catch (err) {
    next(err);
  }
});

// POST /api/tags — create a tag
tagRouter.post("/", async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Missing name" });
      return;
    }
    const tag = await prisma.tag.create({
      data: { name: name.trim(), color: color || null },
    });
    res.status(201).json(tag);
  } catch (err) {
    next(err);
  }
});

// ─── Contact-tag assignment router (mounted at /api/contacts) ─
export const contactTagRouter = Router();

// POST /api/contacts/:id/tags — assign a tag to a contact
contactTagRouter.post("/:id/tags", async (req, res, next) => {
  try {
    const { tagId } = req.body;
    if (!tagId || typeof tagId !== "string") {
      res.status(400).json({ error: "Missing tagId" });
      return;
    }
    const contactTag = await prisma.contactTag.create({
      data: { contactId: req.params.id, tagId },
      include: { tag: true },
    });
    await cache.invalidateContacts().catch(console.error);
    res.status(201).json(contactTag);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/contacts/:id/tags/:tagId — remove a tag from a contact
contactTagRouter.delete("/:id/tags/:tagId", async (req, res, next) => {
  try {
    await prisma.contactTag.deleteMany({
      where: {
        contactId: req.params.id,
        tagId: req.params.tagId,
      },
    });
    await cache.invalidateContacts().catch(console.error);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
