import type {
  Contact, ContactStats, Tag, ImportJob, PlatformType, Platform, Interaction, Note,
} from "./types";
import { MOCK_COMPANIES } from "./mock-companies";

const now = new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

// Reverse-lookup: contactId → { companyName, role }
const COMPANY_BY_CONTACT: Record<string, { name: string; role: string }> = {};
for (const co of MOCK_COMPANIES) {
  for (const c of co.contacts || []) {
    COMPANY_BY_CONTACT[c.id] = { name: co.name, role: c.role || "" };
  }
}

// Per-contact platform overrides (handle/displayName)
const PLATFORM_OVERRIDES: Record<string, { type: PlatformType; handle: string; displayName?: string }[]> = {
  "c-stripe-1": [{ type: "x", handle: "patrickc" }, { type: "linkedin", handle: "patrickcollison" }, { type: "email", handle: "patrick@stripe.com" }],
  "c-stripe-2": [{ type: "x", handle: "collision" }, { type: "linkedin", handle: "johncollison" }],
  "c-stripe-3": [{ type: "linkedin", handle: "willgaybrick" }],
  "c-stripe-4": [{ type: "linkedin", handle: "eileenomara" }, { type: "email", handle: "eileen@stripe.com" }],
  "c-linear-1": [{ type: "x", handle: "karrisaarinen" }, { type: "telegram", handle: "karrisaarinen" }, { type: "linkedin", handle: "karrisaarinen" }],
  "c-linear-2": [{ type: "x", handle: "artman" }, { type: "linkedin", handle: "tuomasartman" }],
  "c-linear-3": [{ type: "x", handle: "jorilallo" }],
  "c-vercel-1": [{ type: "x", handle: "rauchg" }, { type: "linkedin", handle: "rauchg" }, { type: "email", handle: "rauchg@vercel.com" }],
  "c-vercel-2": [{ type: "x", handle: "leeerob" }, { type: "discord", handle: "leerob" }],
  "c-vercel-3": [{ type: "linkedin", handle: "tomocchino" }],
  "c-mistral-1": [{ type: "x", handle: "arthurmensch" }, { type: "linkedin", handle: "arthurmensch" }],
  "c-mistral-2": [{ type: "linkedin", handle: "glample" }],
  "c-mistral-3": [{ type: "linkedin", handle: "timotheelacroix" }],
  "c-ledger-1": [{ type: "x", handle: "pgauthier" }, { type: "linkedin", handle: "pascalgauthier" }, { type: "telegram", handle: "pgauthier" }],
  "c-ledger-2": [{ type: "x", handle: "ianrogers" }, { type: "linkedin", handle: "ianrogers" }],
  "c-ledger-3": [{ type: "x", handle: "P3b7_" }],
  "c-cb-1": [{ type: "x", handle: "brian_armstrong" }, { type: "linkedin", handle: "barmstrong" }],
  "c-cb-2": [{ type: "linkedin", handle: "emiliechoi" }, { type: "email", handle: "emilie@coinbase.com" }],
  "c-circle-1": [{ type: "x", handle: "jerallaire" }, { type: "linkedin", handle: "jerallaire" }],
  "c-phantom-1": [{ type: "x", handle: "brandonmillman" }, { type: "discord", handle: "bmillman" }],
  "c-hf-1": [{ type: "x", handle: "ClementDelangue" }, { type: "linkedin", handle: "clementdelangue" }],
  "c-hf-2": [{ type: "x", handle: "julien_c" }],
  "c-seq-1": [{ type: "x", handle: "roelofbotha" }, { type: "linkedin", handle: "roelofbotha" }],
  "c-a16z-1": [{ type: "x", handle: "pmarca" }],
  "c-a16z-2": [{ type: "x", handle: "cdixon" }, { type: "linkedin", handle: "cdixon" }],
  "c-aglae-2": [{ type: "linkedin", handle: "florianogier" }, { type: "email", handle: "florian@aglae.com" }],
  "c-qonto-1": [{ type: "x", handle: "alexprot" }, { type: "linkedin", handle: "alexandreprot" }],
  "c-penny-1": [{ type: "linkedin", handle: "arthurwaller" }],
  "c-notion-1": [{ type: "x", handle: "ivanhzhao" }],
  "c-ramp-1": [{ type: "x", handle: "ericglyman" }, { type: "linkedin", handle: "ericglyman" }],
  "c-polar-1": [{ type: "x", handle: "birkjernstrom" }, { type: "discord", handle: "birk" }],
};

// Default platforms when nothing specific
function defaultPlatforms(name: string): { type: PlatformType; handle: string }[] {
  const handle = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return [{ type: "linkedin", handle }];
}

function platformsFor(contactId: string, contactName: string): Platform[] {
  const list = PLATFORM_OVERRIDES[contactId] || defaultPlatforms(contactName);
  return list.map((p, idx) => ({
    id: `${contactId}-p${idx}`,
    contactId,
    type: p.type,
    platformId: p.handle,
    displayName: p.displayName || null,
    profileUrl: null,
    createdAt: now,
  }));
}

const INTERACTION_TEMPLATES: { dir: string; platform: PlatformType; text: string }[] = [
  { dir: "inbound", platform: "x", text: "Saw your post on payment rails · would love to chat." },
  { dir: "outbound", platform: "linkedin", text: "Following up on our coffee last week." },
  { dir: "outbound", platform: "telegram", text: "Sent the deck. Let me know your thoughts." },
  { dir: "inbound", platform: "email", text: "Thanks for the intro. Booking a call." },
  { dir: "outbound", platform: "x", text: "Reply DM · happy to share more context." },
  { dir: "inbound", platform: "linkedin", text: "Connected. Open to chatting about partnership." },
];

function interactionsFor(contactId: string, lastContactDate: string | null): Interaction[] {
  if (!lastContactDate) return [];
  const lastTs = new Date(lastContactDate).getTime();
  const count = 3 + (contactId.length % 4);
  const out: Interaction[] = [];
  for (let i = 0; i < count; i++) {
    const tpl = INTERACTION_TEMPLATES[(contactId.length + i) % INTERACTION_TEMPLATES.length];
    const occurredAt = new Date(lastTs - i * 86400000 * (3 + (i % 5))).toISOString();
    out.push({
      id: `${contactId}-i${i}`,
      contactId,
      platform: tpl.platform,
      direction: tpl.dir,
      contentSnippet: tpl.text,
      messageCount: 1 + (i % 5),
      occurredAt,
      createdAt: occurredAt,
    });
  }
  return out;
}

const NOTE_TEMPLATES: Record<string, string[]> = {
  "c-stripe-1": [
    "Discussed potential partnership on EU rails. Patrick interested in Suby's stablecoin off-ramp.",
    "Follow-up needed in 2 weeks with revised proposal.",
  ],
  "c-ledger-1": ["Pascal asked for hardware wallet integration spec. Sent over technical brief."],
  "c-mistral-1": ["Arthur open to discounted API quota in exchange for case study on payment classification."],
  "c-linear-1": ["Karri suggested using Linear for our roadmap. Free team plan for ~3 months."],
  "c-vercel-1": ["Guillermo interested in featuring Suby as a payments case study on Vercel."],
};

function notesFor(contactId: string): Note[] {
  const tpls = NOTE_TEMPLATES[contactId];
  if (!tpls) return [];
  return tpls.map((content, i) => ({
    id: `${contactId}-n${i}`,
    contactId,
    content,
    createdAt: daysAgo(i * 5 + 2),
    updatedAt: daysAgo(i * 5 + 2),
  }));
}

// Build the flat contacts list from MOCK_COMPANIES with enrichment
export const MOCK_CONTACTS: Contact[] = MOCK_COMPANIES.flatMap((co) =>
  (co.contacts || []).map((c) => ({
    ...c,
    company: co.name,
    role: c.role || null,
    platforms: platformsFor(c.id, c.name),
    interactions: interactionsFor(c.id, c.lastContactDate),
    notes: notesFor(c.id),
    contactTags: [],
    _count: {
      interactions: 3 + (c.id.length % 4),
      notes: (NOTE_TEMPLATES[c.id]?.length || 0),
    },
  })),
);

// ─── Stats derived from MOCK_CONTACTS ──────────────────────────
function computeStats(): ContactStats {
  const byType: Record<string, number> = {};
  const byStrength: Record<string, number> = {};
  const byDomain: Record<string, number> = {};
  let stale30 = 0, stale60 = 0, stale90 = 0;
  const nowTs = Date.now();
  for (const c of MOCK_CONTACTS) {
    byType[c.type] = (byType[c.type] || 0) + 1;
    byStrength[c.relationshipStrength] = (byStrength[c.relationshipStrength] || 0) + 1;
    byDomain[c.domain] = (byDomain[c.domain] || 0) + 1;
    if (c.lastContactDate) {
      const days = (nowTs - new Date(c.lastContactDate).getTime()) / 86400000;
      if (days >= 30) stale30++;
      if (days >= 60) stale60++;
      if (days >= 90) stale90++;
    } else {
      stale30++; stale60++; stale90++;
    }
  }
  return { total: MOCK_CONTACTS.length, byType, byStrength, byDomain, stale30, stale60, stale90 };
}

export const MOCK_STATS: ContactStats = computeStats();

// ─── Smart alerts ──────────────────────────────────────────────
export const MOCK_ALERTS: { contactId: string; contactName: string; reason: string }[] = [
  {
    contactId: "c-stripe-2",
    contactName: "John Collison",
    reason: "Cold for 90+ days · was hot in Q1, worth a re-engagement message",
  },
  {
    contactId: "c-aglae-1",
    contactName: "Bernard Arnault",
    reason: "Investor not contacted in 6 months · quarterly update overdue",
  },
  {
    contactId: "c-doc-1",
    contactName: "Stanislas Niox-Chateau",
    reason: "Relationship strength is cold but tagged as strategic · reach out",
  },
  {
    contactId: "c-a16z-1",
    contactName: "Marc Andreessen",
    reason: "No interaction since their fund announcement · congratulate?",
  },
];

// ─── Briefing ──────────────────────────────────────────────────
export function buildBriefing(c: Contact): string {
  const co = MOCK_COMPANIES.find((m) => m.name === c.company);
  return `## Context
${c.name} is ${c.role || "a key contact"}${co ? ` at ${co.name}` : ""}. ${co?.description || ""}

## Recent activity
- Last interaction: ${c.lastContactDate ? new Date(c.lastContactDate).toLocaleDateString() : "Unknown"}
- Relationship: ${c.relationshipStrength} (${c.type})
- Domain focus: ${c.domain}

## Talking points
- Open with a reference to your last exchange.
- ${co?.sector === "payment" ? "Discuss settlement flow and stablecoin rails." : ""}${co?.sector === "crypto" ? "Discuss custody, USDC support and EU regulation." : ""}${co?.sector === "vc" ? "Share updated metrics and runway projections." : ""}${co?.sector === "partner" ? "Explore integration roadmap and co-marketing." : ""}
- Ask about their priorities for the next quarter.

## Action items
- Send a follow-up summary within 24h.
- Propose a next step (intro, demo, deck review).`;
}

// ─── Tags ──────────────────────────────────────────────────────
export const MOCK_TAGS: Tag[] = [
  { id: "t-1", name: "Investor", color: "#4f46e5", createdAt: now },
  { id: "t-2", name: "Strategic", color: "#dc2626", createdAt: now },
  { id: "t-3", name: "EU", color: "#16a34a", createdAt: now },
  { id: "t-4", name: "US", color: "#2563eb", createdAt: now },
  { id: "t-5", name: "Crypto", color: "#ea580c", createdAt: now },
];

// ─── Import jobs ───────────────────────────────────────────────
export const MOCK_IMPORT_JOBS: ImportJob[] = [
  {
    id: "job-1",
    source: "beeper",
    status: "completed",
    totalFound: 247,
    imported: 198,
    deduplicated: 49,
    errors: 0,
    errorLog: null,
    config: { workspaces: ["telegram", "whatsapp", "x"] },
    startedAt: daysAgo(2),
    completedAt: new Date(new Date(daysAgo(2)).getTime() + 8 * 60000).toISOString(),
    createdAt: daysAgo(2),
  },
  {
    id: "job-2",
    source: "telegram_api",
    status: "completed",
    totalFound: 89,
    imported: 89,
    deduplicated: 0,
    errors: 0,
    errorLog: null,
    config: {},
    startedAt: daysAgo(7),
    completedAt: new Date(new Date(daysAgo(7)).getTime() + 4 * 60000).toISOString(),
    createdAt: daysAgo(7),
  },
  {
    id: "job-3",
    source: "whatsapp_export",
    status: "completed",
    totalFound: 56,
    imported: 41,
    deduplicated: 15,
    errors: 0,
    errorLog: null,
    config: { file: "whatsapp_chat.zip" },
    startedAt: daysAgo(14),
    completedAt: new Date(new Date(daysAgo(14)).getTime() + 2 * 60000).toISOString(),
    createdAt: daysAgo(14),
  },
  {
    id: "job-4",
    source: "beeper",
    status: "failed",
    totalFound: null,
    imported: 0,
    deduplicated: 0,
    errors: 1,
    errorLog: { message: "Beeper API rate limit exceeded" },
    config: {},
    startedAt: daysAgo(21),
    completedAt: new Date(new Date(daysAgo(21)).getTime() + 30000).toISOString(),
    createdAt: daysAgo(21),
  },
];
