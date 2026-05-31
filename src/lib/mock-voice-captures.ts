import { MOCK_CONTACTS } from "./mock-contacts";

export type CaptureStatus = "processed" | "failed" | "needs_confirmation";
export type ActionKind = "note" | "reminder" | "strength_bump" | "tag" | "no_action";

export interface ExtractedAction {
  kind: ActionKind;
  contactId: string | null;
  contactName: string | null;
  description: string;
  dueDate?: string | null;
  newStrength?: "cold" | "warm" | "hot";
  tag?: string;
}

export interface VoiceCapture {
  id: string;
  receivedAt: string;
  durationSec: number;
  transcript: string;
  status: CaptureStatus;
  processingMs: number;
  actions: ExtractedAction[];
}

const HOUR = 3600 * 1000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
const inDays = (d: number) => new Date(Date.now() + d * 24 * HOUR).toISOString();

function contactRef(id: string) {
  const c = MOCK_CONTACTS.find((x) => x.id === id);
  return { contactId: id, contactName: c?.name ?? null };
}

export const MOCK_VOICE_CAPTURES: VoiceCapture[] = [
  {
    id: "vc-1",
    receivedAt: ago(0.5),
    durationSec: 14,
    transcript:
      "Coffee with Patrick Collison this morning, he's super engaged on the EU rails. Need to send him the updated deck, follow up in two weeks.",
    status: "processed",
    processingMs: 1820,
    actions: [
      {
        kind: "note",
        ...contactRef("c-stripe-1"),
        description: "Coffee · engaged on EU rails, follow up with updated deck",
      },
      {
        kind: "reminder",
        ...contactRef("c-stripe-1"),
        description: "Send EU rails deck to Patrick",
        dueDate: inDays(14),
      },
      {
        kind: "strength_bump",
        ...contactRef("c-stripe-1"),
        description: "Bump strength → hot",
        newStrength: "hot",
      },
    ],
  },
  {
    id: "vc-2",
    receivedAt: ago(3),
    durationSec: 9,
    transcript:
      "Arthur Mensch confirmed the API quotas, I need to send him the signed contract before Friday.",
    status: "processed",
    processingMs: 1140,
    actions: [
      {
        kind: "reminder",
        ...contactRef("c-mistral-1"),
        description: "Send signed contract to Arthur",
        dueDate: inDays(2),
      },
    ],
  },
  {
    id: "vc-3",
    receivedAt: ago(8),
    durationSec: 7,
    transcript: "Karri Saarinen wants to move the call from Tuesday to Thursday 4pm.",
    status: "needs_confirmation",
    processingMs: 980,
    actions: [
      {
        kind: "reminder",
        ...contactRef("c-linear-1"),
        description: "Confirm call moved to Thursday 4pm",
        dueDate: inDays(1),
      },
    ],
  },
  {
    id: "vc-4",
    receivedAt: ago(22),
    durationSec: 11,
    transcript:
      "Note for Pascal Gauthier, he prefers Telegram over Discord. Always reply within 4 hours.",
    status: "processed",
    processingMs: 1320,
    actions: [
      {
        kind: "note",
        ...contactRef("c-ledger-1"),
        description: "Prefers Telegram over Discord · reply within 4h",
      },
      {
        kind: "tag",
        ...contactRef("c-ledger-1"),
        description: "Tag #fast-replier",
        tag: "fast-replier",
      },
    ],
  },
  {
    id: "vc-5",
    receivedAt: ago(36),
    durationSec: 6,
    transcript: "Marc Andreessen followed me back on X, add to hot leads.",
    status: "processed",
    processingMs: 760,
    actions: [
      {
        kind: "strength_bump",
        ...contactRef("c-a16z-1"),
        description: "Bump strength → warm (now following on X)",
        newStrength: "warm",
      },
      {
        kind: "note",
        ...contactRef("c-a16z-1"),
        description: "Started following on X",
      },
    ],
  },
  {
    id: "vc-6",
    receivedAt: ago(50),
    durationSec: 4,
    transcript: "Test, one, two, is this working.",
    status: "processed",
    processingMs: 540,
    actions: [
      { kind: "no_action", contactId: null, contactName: null, description: "No action · audio test detected." },
    ],
  },
  {
    id: "vc-7",
    receivedAt: ago(78),
    durationSec: 18,
    transcript:
      "Lunch tomorrow with Chris Dixon from a16z at Cecconi's, prep the note on our crypto thesis, need to pull the on-chain settlement stat.",
    status: "processed",
    processingMs: 2110,
    actions: [
      {
        kind: "reminder",
        ...contactRef("c-a16z-2"),
        description: "Prep crypto thesis brief + on-chain settlement stats",
        dueDate: inDays(0),
      },
      {
        kind: "note",
        ...contactRef("c-a16z-2"),
        description: "Lunch at Cecconi's, crypto thesis brief requested",
      },
    ],
  },
  {
    id: "vc-8",
    receivedAt: ago(110),
    durationSec: 3,
    transcript: "[transcription failed · audio too noisy]",
    status: "failed",
    processingMs: 240,
    actions: [],
  },
];

export const ACTION_META: Record<ActionKind, { label: string; color: string; bg: string; icon: string }> = {
  note: { label: "Note", color: "var(--yc)", bg: "var(--yb)", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2 14 8 20 8" },
  reminder: { label: "Reminder", color: "var(--oc)", bg: "var(--ob)", icon: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 5v5l4 2" },
  strength_bump: { label: "Strength", color: "var(--rc)", bg: "var(--rb)", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
  tag: { label: "Tag", color: "var(--pc)", bg: "var(--pb)", icon: "M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01" },
  no_action: { label: "No action", color: "var(--t3)", bg: "var(--al)", icon: "M5 12h14" },
};

export const STATUS_META: Record<CaptureStatus, { label: string; color: string; bg: string }> = {
  processed: { label: "Processed", color: "var(--gc)", bg: "var(--gb)" },
  needs_confirmation: { label: "Needs your OK", color: "var(--oc)", bg: "var(--ob)" },
  failed: { label: "Failed", color: "var(--rc)", bg: "var(--rb)" },
};

// Simulator templates · used by the "Try a capture" button
export const SIMULATOR_TEMPLATES: { label: string; transcript: string; contactId: string; build: (c: { contactId: string; contactName: string | null }) => ExtractedAction[] }[] = [
  {
    label: "Quick note",
    transcript: "Great chat with Guillermo Rauch, he wants to feature Suby as a Vercel case study.",
    contactId: "c-vercel-1",
    build: (c) => [
      { kind: "note", ...c, description: "Wants to feature Suby as a Vercel case study" },
      { kind: "strength_bump", ...c, description: "Bump strength → hot", newStrength: "hot" },
    ],
  },
  {
    label: "Reminder in 3d",
    transcript: "Follow up with Clément Delangue in 3 days about model hosting pricing.",
    contactId: "c-hf-1",
    build: (c) => [
      { kind: "reminder", ...c, description: "Follow up on model hosting pricing", dueDate: inDays(3) },
    ],
  },
  {
    label: "Lunch tomorrow",
    transcript: "Lunch tomorrow with Alexandre Prot, prep the merchant flow deck.",
    contactId: "c-qonto-1",
    build: (c) => [
      { kind: "reminder", ...c, description: "Prepare merchant flow deck", dueDate: inDays(0) },
      { kind: "note", ...c, description: "Lunch confirmed tomorrow" },
    ],
  },
];
