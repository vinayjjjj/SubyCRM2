import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// GET /api/companies — list all companies with contact count
router.get("/", async (_req, res, next) => {
  try {
    const companies = await prisma.company.findMany({
      include: {
        _count: { select: { contacts: true } },
      },
      orderBy: {
        contacts: { _count: "desc" },
      },
    });
    res.json(
      companies.map((c) => ({
        ...c,
        contactCount: c._count.contacts,
        _count: undefined,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/companies/:id — single company with all contacts
router.get("/:id", async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        contacts: {
          include: {
            platforms: { select: { type: true, platformId: true, displayName: true } },
          },
          orderBy: { name: "asc" },
        },
      },
    });
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json(company);
  } catch (err) {
    next(err);
  }
});

// POST /api/companies — create company
router.post("/", async (req, res, next) => {
  try {
    const { name, domain, sector, size, funding, linkedin, website, description } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Missing name" });
      return;
    }
    const company = await prisma.company.create({
      data: { name, domain, sector, size, funding, linkedin, website, description },
    });
    res.status(201).json(company);
  } catch (err) {
    next(err);
  }
});

// PUT /api/companies/:id — update company
router.put("/:id", async (req, res, next) => {
  try {
    const { name, domain, sector, size, funding, linkedin, website, description } = req.body;
    const company = await prisma.company.update({
      where: { id: req.params.id },
      data: { name, domain, sector, size, funding, linkedin, website, description },
    });
    res.json(company);
  } catch (err) {
    next(err);
  }
});

// POST /api/companies/:id/assign — assign contacts to company
router.post("/:id/assign", async (req, res, next) => {
  try {
    const { contactIds } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      res.status(400).json({ error: "Missing contactIds array" });
      return;
    }
    await prisma.contact.updateMany({
      where: { id: { in: contactIds } },
      data: { companyId: req.params.id },
    });
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        contacts: {
          include: {
            platforms: { select: { type: true, platformId: true, displayName: true } },
          },
        },
        _count: { select: { contacts: true } },
      },
    });
    res.json(company);
  } catch (err) {
    next(err);
  }
});

export default router;
