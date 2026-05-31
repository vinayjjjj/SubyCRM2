import type { Contact, PlatformType } from "./types";
import { MOCK_CONTACTS } from "./mock-contacts";
import { MOCK_COMPANIES } from "./mock-companies";

export type ReachOutUrgency = "high" | "medium" | "low";

export interface ReachOutSuggestion {
  contactId: string;
  contact: Contact;
  urgency: ReachOutUrgency;
  score: number;
  reason: string;
  channel: PlatformType | null;
  channelHandle: string | null;
  draftMessage: string;
  signals: string[];
}

const TYPE_WEIGHT: Record<string, number> = {
  vc: 30, lead: 28, partner: 22, advisor: 18, prospect: 16,
  friend: 10, team: 8, media: 12, other: 5,
};

const STRENGTH_WEIGHT: Record<string, number> = {
  hot: 10,
  warm: 18,
  cold: 6,
};

const COMPANY_BY_NAME: Record<string, (typeof MOCK_COMPANIES)[number]> = Object.fromEntries(
  MOCK_COMPANIES.map((c) => [c.name, c]),
);

function daysSince(iso: string | null): number {
  if (!iso) return 9999;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function preferredChannel(c: Contact): { type: PlatformType; handle: string } | null {
  if (!c.platforms || c.platforms.length === 0) return null;
  // Order: telegram > x > linkedin > email > rest
  const order: PlatformType[] = ["telegram", "x", "linkedin", "email", "discord", "whatsapp", "slack", "matrix"];
  for (const t of order) {
    const found = c.platforms.find((p) => p.type === t);
    if (found) return { type: found.type, handle: found.platformId };
  }
  return { type: c.platforms[0].type, handle: c.platforms[0].platformId };
}

function urgencyOf(score: number): ReachOutUrgency {
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function draftFor(c: Contact, signals: string[]): string {
  const co = c.company ? COMPANY_BY_NAME[c.company] : null;
  const firstName = c.name.split(" ")[0];
  const days = daysSince(c.lastContactDate);

  if (c.type === "vc") {
    return `Hi ${firstName}, hope all is well. Wanted to share a quick Suby update since we last spoke ${days < 9999 ? `${days}d ago` : "a while back"} · we've shipped X and are seeing Y on the merchant side. Worth a 20min sync this/next week?`;
  }
  if (co?.sector === "crypto") {
    return `Hey ${firstName}, the team's been making real progress on the on-chain settlement side. Given ${co.name}'s positioning, I think there's a clean integration story · would you be open to comparing notes briefly?`;
  }
  if (co?.sector === "payment") {
    return `Hey ${firstName}, popping back into your inbox · we've moved forward on the EU rails work and I'd love your read on what we're building. 20min next week?`;
  }
  if (c.type === "partner" || co?.sector === "partner") {
    return `Hey ${firstName}, it's been a minute. Quick update from our side + I'd love to hear what's hot on your roadmap. Coffee/call this week?`;
  }
  if (c.relationshipStrength === "hot") {
    return `Hey ${firstName}! Realised it's been ${days}d. Don't want the momentum to slip · when works for a quick catch-up?`;
  }
  return `Hi ${firstName}, just checking in · would be good to reconnect when you have a moment. How are things at ${c.company || "your end"}?`;
}

function reasonAndScore(c: Contact): { score: number; reason: string; signals: string[] } | null {
  const signals: string[] = [];
  const days = daysSince(c.lastContactDate);

  // Skip contacts we just talked to (< 5 days) unless they're hot leads
  if (days < 5 && c.relationshipStrength !== "hot") return null;

  let score = 0;

  // Staleness curve
  if (days >= 180) { score += 35; signals.push(`Cold for ${Math.round(days / 30)}mo`); }
  else if (days >= 90) { score += 28; signals.push(`${days}d silence`); }
  else if (days >= 60) { score += 20; signals.push(`${days}d silence`); }
  else if (days >= 30) { score += 14; signals.push(`${days}d silence`); }
  else if (days >= 14) { score += 8; }

  // Type weight
  score += TYPE_WEIGHT[c.type] ?? 5;
  if (c.type === "vc" || c.type === "lead") signals.push(`${c.type.toUpperCase()} priority`);

  // Strength signal · warm > cold > hot (hot means recent, less need to reach)
  score += STRENGTH_WEIGHT[c.relationshipStrength] ?? 0;
  if (c.relationshipStrength === "warm" && days >= 30) signals.push("Warm getting cold");
  if (c.relationshipStrength === "hot" && days >= 14) signals.push("Hot deal cooling");

  // Bonus for known investors or strategic partners (from company funding tag)
  const co = c.company ? COMPANY_BY_NAME[c.company] : null;
  if (co?.sector === "vc") { score += 5; signals.push("Investor pool"); }
  if (co?.sector === "crypto" || co?.sector === "payment") { score += 6; signals.push(`${co.sector} synergy`); }

  // Has notes → invested relationship
  if ((c.notes?.length ?? 0) > 0) { score += 4; }

  // Build the reason
  let reason: string;
  if (days >= 90) {
    reason = `Cold for ${days}d · ${c.type === "vc" ? "investor update overdue" : "relationship cooling"}`;
  } else if (days >= 30 && c.relationshipStrength === "warm") {
    reason = `Warm but ${days}d silent · momentum is slipping`;
  } else if (c.relationshipStrength === "hot" && days >= 14) {
    reason = `Hot lead going quiet (${days}d) · risk of losing the deal`;
  } else if (c.type === "vc" && days >= 30) {
    reason = `Investor not updated in ${days}d`;
  } else {
    reason = `${days}d since last touch · ${c.type}`;
  }

  return { score, reason, signals };
}

export function computeSuggestions(limit = 8): ReachOutSuggestion[] {
  const suggestions: ReachOutSuggestion[] = [];
  for (const c of MOCK_CONTACTS) {
    const r = reasonAndScore(c);
    if (!r) continue;
    const ch = preferredChannel(c);
    suggestions.push({
      contactId: c.id,
      contact: c,
      urgency: urgencyOf(r.score),
      score: r.score,
      reason: r.reason,
      channel: ch?.type ?? null,
      channelHandle: ch?.handle ?? null,
      draftMessage: draftFor(c, r.signals),
      signals: r.signals,
    });
  }
  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.slice(0, limit);
}

export const URGENCY_COLOR: Record<ReachOutUrgency, { bg: string; color: string; label: string }> = {
  high: { bg: "var(--rb)", color: "var(--rc)", label: "High priority" },
  medium: { bg: "var(--ob)", color: "var(--oc)", label: "Medium" },
  low: { bg: "var(--bb)", color: "var(--bc)", label: "Low" },
};
