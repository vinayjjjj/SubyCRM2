export type CallChannel = "zoom" | "meet" | "phone" | "in_person" | "telegram" | "x_space";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  contactId: string;
  contactName: string;
  channel: CallChannel;
  tzOffset?: number;
  location?: string;
  description?: string;
}

const now = new Date();
const monday = new Date(now);
monday.setHours(0, 0, 0, 0);
const dow = (now.getDay() + 6) % 7;
monday.setDate(monday.getDate() - dow);

function day(offset: number, hour: number, minute = 0): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + offset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function evt(
  id: string,
  title: string,
  startDate: Date,
  durMin: number,
  contactId: string,
  contactName: string,
  channel: CallChannel,
  location?: string,
  description?: string,
): CalendarEvent {
  return {
    id,
    title,
    start: startDate.toISOString(),
    end: new Date(startDate.getTime() + durMin * 60000).toISOString(),
    contactId,
    contactName,
    channel,
    location,
    description,
  };
}

export const MOCK_EVENTS: CalendarEvent[] = [
  // Last week
  evt("e-l1", "Stripe sync · settlement flow", day(-7, 14), 45, "c-stripe-1", "Patrick Collison", "zoom", "https://zoom.us/j/123", "Initial sync on EU rails integration"),
  evt("e-l2", "Ledger touchpoint", day(-5, 11), 30, "c-ledger-1", "Pascal Gauthier", "meet"),
  evt("e-l3", "Mistral pricing", day(-4, 16), 30, "c-mistral-1", "Arthur Mensch", "phone"),

  // This week
  evt("e-1", "Patrick · partnership update", day(0, 10), 30, "c-stripe-1", "Patrick Collison", "zoom", "https://zoom.us/j/456", "Recap partnership deck and next steps for EU rollout"),
  evt("e-2", "Pascal Gauthier · MOU follow-up", day(0, 14, 30), 45, "c-ledger-1", "Pascal Gauthier", "meet", "https://meet.google.com/abc-xyz", "Discuss revised MOU for hardware wallet pilot"),
  evt("e-3", "Arthur Mensch · API quota", day(1, 9, 30), 30, "c-mistral-1", "Arthur Mensch", "phone", "+33 1 23 45 67 89", "Confirm API quota and pricing for classification model"),
  evt("e-4", "Karri Saarinen · Q2 product sync", day(2, 14), 45, "c-linear-1", "Karri Saarinen", "telegram", undefined, "Quarterly product roadmap alignment"),
  evt("e-5", "Guillermo Rauch · edge runtime intro", day(2, 17), 30, "c-vercel-1", "Guillermo Rauch", "zoom", "https://zoom.us/j/789", "Intro on edge runtime for Suby payment APIs"),
  evt("e-6", "Emilie Choi · exec summary deck", day(3, 9, 30), 30, "c-cb-2", "Emilie Choi", "meet", "https://meet.google.com/xyz-abc", "Walk through Q2 exec summary"),
  evt("e-7", "Lunch with Chris Dixon · crypto thesis", day(3, 12, 30), 75, "c-a16z-2", "Chris Dixon", "in_person", "Cecconi's, NYC", "Discuss our crypto thesis brief"),
  evt("e-8", "Alexandre Prot · partnership review", day(4, 11), 45, "c-qonto-1", "Alexandre Prot", "meet", "https://meet.google.com/qonto-review", "Quarterly partnership review with Qonto"),
  evt("e-9", "Clément Delangue · model hosting", day(4, 16), 30, "c-hf-1", "Clément Delangue", "zoom", "https://zoom.us/j/hf123", "Model hosting agreement"),

  // Next week
  evt("e-n1", "Jeremy Allaire · USDC integration", day(7, 15), 45, "c-circle-1", "Jeremy Allaire", "zoom"),
  evt("e-n2", "Pat Grady · investor update", day(9, 10), 30, "c-seq-3", "Pat Grady", "phone"),
  evt("e-n3", "Brandon Millman · Phantom wallet flow", day(11, 14, 30), 45, "c-phantom-1", "Brandon Millman", "meet"),

  // All-hands / non-call (filter out below · keep only 1:1)
];
