import { MOCK_CONTACTS } from "./mock-contacts";
import { MOCK_COMPANIES } from "./mock-companies";

export type DealStage = "intro" | "first_call" | "tech_review" | "term_sheet" | "live" | "lost";

export interface Deal {
  id: string;
  companyId: string;
  companyName: string;
  contactId: string;
  contactName: string;
  stage: DealStage;
  value: number;        // monthly volume in EUR
  probability: number;  // 0–100
  enteredStageAt: string;
  nextStep: string | null;
  source: "outbound" | "inbound" | "referral" | "event";
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

const find = (cid: string) => {
  const c = MOCK_CONTACTS.find((x) => x.id === cid);
  if (!c) throw new Error(`unknown contact ${cid}`);
  const co = MOCK_COMPANIES.find((x) => x.name === c.company);
  if (!co) throw new Error(`unknown company for ${cid}`);
  return { contactId: c.id, contactName: c.name, companyId: co.id, companyName: co.name };
};

export const MOCK_DEALS: Deal[] = [
  // ─── live ─────────────────────────────────────────────
  {
    id: "d-1",
    ...find("c-linear-1"),
    stage: "live",
    value: 12000,
    probability: 100,
    enteredStageAt: daysAgo(45),
    nextStep: "Quarterly review in March",
    source: "referral",
  },
  // ─── term sheet ───────────────────────────────────────
  {
    id: "d-2",
    ...find("c-stripe-1"),
    stage: "term_sheet",
    value: 85000,
    probability: 70,
    enteredStageAt: daysAgo(10),
    nextStep: "Legal review with Stripe counsel",
    source: "outbound",
  },
  {
    id: "d-3",
    ...find("c-ledger-1"),
    stage: "term_sheet",
    value: 28000,
    probability: 65,
    enteredStageAt: daysAgo(6),
    nextStep: "Send revised MOU draft",
    source: "outbound",
  },
  // ─── tech review ──────────────────────────────────────
  {
    id: "d-4",
    ...find("c-mistral-1"),
    stage: "tech_review",
    value: 18000,
    probability: 55,
    enteredStageAt: daysAgo(8),
    nextStep: "Schedule integration call with their CTO",
    source: "inbound",
  },
  {
    id: "d-5",
    ...find("c-circle-1"),
    stage: "tech_review",
    value: 42000,
    probability: 50,
    enteredStageAt: daysAgo(14),
    nextStep: "USDC settlement integration spec review",
    source: "outbound",
  },
  {
    id: "d-6",
    ...find("c-qonto-1"),
    stage: "tech_review",
    value: 25000,
    probability: 60,
    enteredStageAt: daysAgo(11),
    nextStep: "Review merchant onboarding flow API",
    source: "referral",
  },
  // ─── first call ───────────────────────────────────────
  {
    id: "d-7",
    ...find("c-vercel-1"),
    stage: "first_call",
    value: 9000,
    probability: 40,
    enteredStageAt: daysAgo(2),
    nextStep: "Send pricing options after edge runtime call",
    source: "inbound",
  },
  {
    id: "d-8",
    ...find("c-cb-2"),
    stage: "first_call",
    value: 60000,
    probability: 35,
    enteredStageAt: daysAgo(5),
    nextStep: "Walk through institutional roadmap",
    source: "outbound",
  },
  {
    id: "d-9",
    ...find("c-phantom-1"),
    stage: "first_call",
    value: 14000,
    probability: 30,
    enteredStageAt: daysAgo(9),
    nextStep: "Wallet onboarding demo",
    source: "event",
  },
  // ─── intro ────────────────────────────────────────────
  {
    id: "d-10",
    ...find("c-hf-1"),
    stage: "intro",
    value: 22000,
    probability: 20,
    enteredStageAt: daysAgo(3),
    nextStep: "Reply to Clément with availabilities",
    source: "outbound",
  },
  {
    id: "d-11",
    ...find("c-polar-1"),
    stage: "intro",
    value: 5000,
    probability: 25,
    enteredStageAt: daysAgo(1),
    nextStep: "Find common time for kickoff",
    source: "inbound",
  },
  // ─── lost ─────────────────────────────────────────────
  {
    id: "d-12",
    ...find("c-kraken-1"),
    stage: "lost",
    value: 30000,
    probability: 0,
    enteredStageAt: daysAgo(30),
    nextStep: "Re-engage in Q3",
    source: "outbound",
  },
];

export const STAGE_META: Record<DealStage, { label: string; color: string; bg: string; order: number }> = {
  intro:       { label: "Intro",        color: "var(--t2)", bg: "var(--al)",   order: 1 },
  first_call:  { label: "First call",   color: "var(--bc)", bg: "var(--bb)",   order: 2 },
  tech_review: { label: "Tech review",  color: "var(--pc)", bg: "var(--pb)",   order: 3 },
  term_sheet:  { label: "Term sheet",   color: "var(--oc)", bg: "var(--ob)",   order: 4 },
  live:        { label: "Live",         color: "var(--gc)", bg: "var(--gb)",   order: 5 },
  lost:        { label: "Lost",         color: "var(--rc)", bg: "var(--rb)",   order: 6 },
};

export const STAGES_ORDERED: DealStage[] = ["intro", "first_call", "tech_review", "term_sheet", "live", "lost"];
