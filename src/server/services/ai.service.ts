import OpenAI from "openai";
import { prisma } from "../lib/prisma";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}
const MODEL = "gpt-4o-mini";

// Cache alerts result for 5 min — prevents a GPT call on every dashboard load
type AlertItem = { type: string; contactId: string; contactName: string; reason: string; urgency: "high" | "medium" | "low"; draftMessage: string; channel: string | null; channelHandle: string | null };
let alertsCache: { data: AlertItem[]; ts: number } | null = null;
const ALERTS_TTL = 5 * 60_000;

interface ClassifyResult { type: string; domain: string; confidence: number; }
interface ContactForAI {
  id: string; name: string; company?: string | null; role?: string | null;
  platforms: Array<{ type: string; displayName?: string | null }>;
  interactions: Array<{ platform: string; direction: string; contentSnippet?: string | null; occurredAt: Date }>;
  notes?: Array<{ content: string }>;
  contactTags?: Array<{ tag: { name: string } }>;
}

export const ALLOWED_TYPES = ["vc", "lead", "partner", "friend", "prospect", "team", "advisor", "media", "other"];
export const ALLOWED_DOMAINS = ["payment", "blockchain", "saas", "ecommerce", "ai", "marketing", "legal", "finance", "other"];

export function sanitizeType(val: unknown): string {
  if (typeof val !== "string") return "other";
  const s = val.toLowerCase().trim();
  if (ALLOWED_TYPES.includes(s)) return s;
  if (s === "investor" || s === "venture capitalist" || s === "angel") return "vc";
  if (s === "customer" || s === "client") return "lead";
  return "other";
}

export function sanitizeDomain(val: unknown): string {
  if (typeof val !== "string") return "other";
  const s = val.toLowerCase().trim();
  if (ALLOWED_DOMAINS.includes(s)) return s;
  if (s === "crypto" || s === "web3" || s === "defi" || s === "blockchain technology") return "blockchain";
  if (s === "fintech") return "finance";
  return "other";
}

export const aiService = {
  async classifyContact(contact: ContactForAI): Promise<ClassifyResult> {
    const platforms = contact.platforms.map((p) => `${p.type}${p.displayName ? ` (${p.displayName})` : ""}`).join(", ");
    const interactions = contact.interactions.slice(0, 10)
      .map((i) => `[${i.occurredAt.toISOString().slice(0, 10)}] ${i.platform} ${i.direction}${i.contentSnippet ? `: ${i.contentSnippet.slice(0, 200)}` : ""}`)
      .join("\n");
    const notes = (contact.notes || []).slice(0, 10).map((n) => `- ${n.content.slice(0, 300)}`).join("\n");
    const tags = (contact.contactTags || []).map((ct) => ct.tag.name).join(", ");

    const res = await getOpenAI().chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [{
        role: "system",
        content: `Classify a CRM contact into the most appropriate category based on their name, company, role, platforms, notes, tags, and interactions.
        
Return JSON:
{ 
  "type": one of [vc, lead, partner, friend, prospect, team, advisor, media, other], 
  "domain": one of [payment, blockchain, saas, ecommerce, ai, marketing, legal, finance, other], 
  "confidence": 0-1 
}

Guidelines for Type:
- vc: Venture capitalists, investors, angels.
- lead: Potential business leads, prospective clients/customers.
- partner: Business partners, service providers, collaborators.
- friend: Personal friends, social connections.
- prospect: Early stage potential leads or targets.
- team: Coworkers, employees, founders.
- advisor: Mentors, board members, advisors.
- media: Journalists, PR, influencers.
- other: Default only if none of the above fits.

Guidelines for Domain:
- payment: Payment processing, merchant services, gateway companies.
- blockchain: Crypto, Web3, DeFi, blockchain technology.
- saas: Software as a service, B2B software.
- ecommerce: Online retail, shopping platforms.
- ai: Artificial intelligence, machine learning.
- marketing: Marketing agencies, advertising, CMOs, marketing roles.
- legal: Lawyers, legal tech, compliance.
- finance: Traditional banking, accounting, fintech (non-blockchain).
- other: Default only if none of the above fits.

Be proactive: choose the most specific matching category. Avoid using "other" unless there is absolutely no signal.`,
      }, {
        role: "user",
        content: `Name: ${contact.name}\nCompany: ${contact.company || "Unknown"}\nRole: ${contact.role || "Unknown"}\nPlatforms: ${platforms || "None"}\nTags: ${tags || "None"}\n\nInteractions:\n${interactions || "None"}\n\nNotes:\n${notes || "None"}`,
      }],
    });

    let result: ClassifyResult = { type: "other", domain: "other", confidence: 0 };
    try {
      const parsed = JSON.parse(res.choices[0].message.content ?? "{}");
      result = {
        type: sanitizeType(parsed.type),
        domain: sanitizeDomain(parsed.domain),
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      };
    } catch (err) {
      console.error("[ai-classify] Parse failed:", err);
    }
    return result;
  },

  async generateSummary(contact: ContactForAI): Promise<string> {
    const platforms = contact.platforms.map((p) => `${p.type}${p.displayName ? ` (${p.displayName})` : ""}`).join(", ");
    const interactions = contact.interactions.slice(0, 20)
      .map((i) => `[${i.occurredAt.toISOString().slice(0, 10)}] ${i.platform} ${i.direction}${i.contentSnippet ? `: ${i.contentSnippet.slice(0, 200)}` : ""}`)
      .join("\n");
    const notes = (contact.notes || []).slice(0, 10).map((n) => `- ${n.content.slice(0, 300)}`).join("\n");
    const tags = (contact.contactTags || []).map((ct) => ct.tag.name).join(", ");

    const res = await getOpenAI().chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      messages: [{
        role: "system",
        content: "Write a concise 2-4 sentence professional CRM summary for this contact. Focus on who they are, the relationship status, and key points. Return only the summary text.",
      }, {
        role: "user",
        content: `Name: ${contact.name}\nCompany: ${contact.company || "Unknown"}\nRole: ${contact.role || "Unknown"}\nPlatforms: ${platforms || "None"}\nTags: ${tags || "None"}\n\nInteractions:\n${interactions || "None"}\n\nNotes:\n${notes || "None"}`,
      }],
    });

    return res.choices[0].message.content?.trim() ?? "";
  },

  async generatePrep(contact: ContactForAI): Promise<{
    summary: string; talkingPoints: string[]; recentActivity: string; suggestedActions: string[];
  }> {
    const platforms = contact.platforms.map((p) => `${p.type}${p.displayName ? ` (${p.displayName})` : ""}`).join(", ");
    const interactions = contact.interactions.slice(0, 20)
      .map((i) => `[${i.occurredAt.toISOString().slice(0, 10)}] ${i.platform} ${i.direction}${i.contentSnippet ? `: ${i.contentSnippet.slice(0, 200)}` : ""}`)
      .join("\n");
    const notes = (contact.notes || []).slice(0, 10).map((n) => `- ${n.content.slice(0, 300)}`).join("\n");
    const tags = (contact.contactTags || []).map((ct) => ct.tag.name).join(", ");

    const res = await getOpenAI().chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0.3,
      messages: [{
        role: "system",
        content: `Generate a meeting prep briefing. Return JSON: { "summary": "2-3 sentences", "talkingPoints": ["...","...","..."], "recentActivity": "1-2 sentences", "suggestedActions": ["...","..."] }`,
      }, {
        role: "user",
        content: `Name: ${contact.name}\nCompany: ${contact.company || "Unknown"}\nRole: ${contact.role || "Unknown"}\nPlatforms: ${platforms}\nTags: ${tags || "None"}\n\nInteractions:\n${interactions || "None"}\n\nNotes:\n${notes || "None"}`,
      }],
    });

    return JSON.parse(res.choices[0].message.content ?? "{}");
  },

  async getAlerts(): Promise<AlertItem[]> {
    const now = Date.now();
    if (alertsCache && now - alertsCache.ts < ALERTS_TTL) return alertsCache.data;
    const thirtyDays = 30 * 86400_000;
    const fourteenDays = 14 * 86400_000;

    const [staleVCs, coolingHot, stalePartners] = await Promise.all([
      prisma.contact.findMany({
        where: { type: "vc", lastContactDate: { lt: new Date(now - thirtyDays) } },
        include: { platforms: true, notes: { orderBy: { createdAt: "desc" }, take: 2 } },
        orderBy: { lastContactDate: "asc" }, take: 5,
      }),
      prisma.contact.findMany({
        where: { relationshipStrength: "hot", lastContactDate: { lt: new Date(now - fourteenDays) } },
        include: { platforms: true, notes: { orderBy: { createdAt: "desc" }, take: 2 } },
        take: 5,
      }),
      prisma.contact.findMany({
        where: { type: "partner", lastContactDate: { lt: new Date(now - thirtyDays) } },
        include: { platforms: true, notes: { orderBy: { createdAt: "desc" }, take: 2 } },
        orderBy: { lastContactDate: "asc" }, take: 3,
      }),
    ]);

    type RawContact = typeof staleVCs[0];
    const getPreferredChannel = (c: RawContact) => {
      const p = c.platforms.find((p) => ["telegram", "linkedin", "email", "x"].includes(p.type));
      return p ? { channel: p.type, handle: p.displayName ?? p.platformId } : { channel: null, handle: null };
    };
    const daysSince = (d: Date | null) => d ? Math.floor((now - d.getTime()) / 86400_000) : 999;

    const contactsForGPT: Array<{ id: string; name: string; company: string | null; role: string | null; type: string; daysSince: number; lastNote: string | null; urgency: "high" | "medium" | "low" }> = [
      ...staleVCs.map((c) => ({ id: c.id, name: c.name, company: c.company, role: c.role, type: "vc", daysSince: daysSince(c.lastContactDate), lastNote: c.notes[0]?.content ?? null, urgency: "high" as const })),
      ...coolingHot.map((c) => ({ id: c.id, name: c.name, company: c.company, role: c.role, type: "hot", daysSince: daysSince(c.lastContactDate), lastNote: c.notes[0]?.content ?? null, urgency: "high" as const })),
      ...stalePartners.map((c) => ({ id: c.id, name: c.name, company: c.company, role: c.role, type: "partner", daysSince: daysSince(c.lastContactDate), lastNote: c.notes[0]?.content ?? null, urgency: "medium" as const })),
    ];

    if (contactsForGPT.length === 0) { alertsCache = { data: [], ts: Date.now() }; return []; }

    // Single GPT call to generate all draft messages + reasons
    const gptRes = await getOpenAI().chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [{
        role: "system",
        content: `You are a CRM assistant for a founder. For each contact below, write a short personalised reach-out message (1-2 sentences, casual but professional) and a concise reason why to reach out now.
Return JSON: { "items": [{ "id": "<contact id>", "reason": "<short reason>", "draftMessage": "<the short message to send>" }] }`,
      }, {
        role: "user",
        content: JSON.stringify(contactsForGPT.map((c) => ({
          id: c.id,
          name: c.name,
          company: c.company,
          role: c.role,
          type: c.type,
          daysSinceLast: c.daysSince,
          lastNote: c.lastNote,
        }))),
      }],
    });

    let drafts: Array<{ id: string; reason: string; draftMessage: string }> = [];
    try {
      const parsed = JSON.parse(gptRes.choices[0].message.content ?? "{}");
      drafts = parsed.items ?? [];
    } catch { /* fallback to empty */ }

    const draftMap = new Map(drafts.map((d) => [d.id, d]));

    const allContacts: RawContact[] = [...staleVCs, ...coolingHot, ...stalePartners];
    const seen = new Set<string>();

    const result: AlertItem[] = contactsForGPT
      .filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; })
      .map((c) => {
        const full = allContacts.find((x) => x.id === c.id)!;
        const { channel, handle } = getPreferredChannel(full);
        const draft = draftMap.get(c.id);
        return {
          type: c.type,
          contactId: c.id,
          contactName: c.name,
          reason: draft?.reason ?? (c.type === "vc" ? `No contact in ${c.daysSince} days` : c.type === "hot" ? "Hot contact going cold" : `Partner follow-up overdue`),
          urgency: c.urgency,
          draftMessage: draft?.draftMessage ?? `Hey ${c.name}, just checking in — it's been a while. Hope all is well!`,
          channel,
          channelHandle: handle,
        };
      });
    alertsCache = { data: result, ts: Date.now() };
    return result;
  },
};
