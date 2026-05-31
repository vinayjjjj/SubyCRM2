import { MOCK_CONTACTS } from "./mock-contacts";

export type StepStatus = "sent" | "scheduled" | "waiting" | "skipped";

export interface SequenceStep {
  id: string;
  index: number;
  channel: "email" | "linkedin" | "telegram" | "x";
  delayDays: number;          // since prev step or start
  scheduledFor: string;       // ISO
  status: StepStatus;
  draft: string;
  rationale: string;
}

export interface Sequence {
  id: string;
  contactId: string;
  contactName: string;
  company: string | null;
  goal: string;
  startedAt: string;
  paused: boolean;
  steps: SequenceStep[];
}

const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

const c = (id: string) => {
  const x = MOCK_CONTACTS.find((m) => m.id === id);
  return { contactId: id, contactName: x?.name ?? id, company: x?.company ?? null };
};

export const MOCK_SEQUENCES: Sequence[] = [
  {
    id: "seq-1",
    ...c("c-aglae-1"),
    goal: "Re-open conversation · investor not contacted in 6 months",
    startedAt: ago(7),
    paused: false,
    steps: [
      {
        id: "s-1-1", index: 1, channel: "email", delayDays: 0, scheduledFor: ago(7), status: "sent",
        draft: "Hi Bernard, hope you're well. Wanted to send a quick update on Suby · Q1 numbers look strong, would love your take.",
        rationale: "Initial touch · short, low-pressure, share a metric.",
      },
      {
        id: "s-1-2", index: 2, channel: "linkedin", delayDays: 5, scheduledFor: ago(2), status: "sent",
        draft: "Bernard, following up on my email · quick note here in case it slipped. Open to a 15min sync this week?",
        rationale: "No reply after 5d on email → ping LinkedIn with softer ask.",
      },
      {
        id: "s-1-3", index: 3, channel: "email", delayDays: 7, scheduledFor: inDays(5), status: "waiting",
        draft: "Bernard, last try from my side · no worries if not the right moment. Pinging back in Q3 otherwise.",
        rationale: "If still no reply after 5d on LinkedIn → soft break-up, removes friction.",
      },
    ],
  },
  {
    id: "seq-2",
    ...c("c-stripe-2"),
    goal: "Re-warm John after 90d silence",
    startedAt: ago(3),
    paused: false,
    steps: [
      {
        id: "s-2-1", index: 1, channel: "x", delayDays: 0, scheduledFor: ago(3), status: "sent",
        draft: "John 👋 saw your post on cross-border fees. Suby's been working on something similar · quick chat next week?",
        rationale: "Reference a recent X post he made → high-context opener.",
      },
      {
        id: "s-2-2", index: 2, channel: "email", delayDays: 4, scheduledFor: inDays(1), status: "scheduled",
        draft: "Hey John, lobbed a DM your way on X · not sure if it landed. Same idea here. Worth 15min?",
        rationale: "X DMs often get missed · mirror the message by email.",
      },
      {
        id: "s-2-3", index: 3, channel: "email", delayDays: 7, scheduledFor: inDays(8), status: "waiting",
        draft: "Last nudge from me · sharing a one-pager on what we're seeing on EU rails (attached). Happy to leave it there.",
        rationale: "Add value (one-pager) instead of asking again.",
      },
    ],
  },
  {
    id: "seq-3",
    ...c("c-doc-1"),
    goal: "Strategic partnership exploration",
    startedAt: ago(1),
    paused: false,
    steps: [
      {
        id: "s-3-1", index: 1, channel: "linkedin", delayDays: 0, scheduledFor: ago(1), status: "sent",
        draft: "Stanislas, intro from Sequoia · we've been comparing notes on French healthtech checkout flows. Open to a quick call?",
        rationale: "Lead with the warm intro context.",
      },
      {
        id: "s-3-2", index: 2, channel: "email", delayDays: 6, scheduledFor: inDays(5), status: "scheduled",
        draft: "Hi Stanislas, following up on my LinkedIn · sending the deck on what we're building so you can skim before deciding.",
        rationale: "Move to a more durable channel + offer a deck to reduce commitment.",
      },
      {
        id: "s-3-3", index: 3, channel: "linkedin", delayDays: 10, scheduledFor: inDays(15), status: "waiting",
        draft: "Stanislas, last ping · let me know if better timing in a few months works for you.",
        rationale: "Soft break-up keeps the door open for later.",
      },
    ],
  },
  {
    id: "seq-4",
    ...c("c-cb-1"),
    goal: "Get on Brian Armstrong's radar for the EU expansion",
    startedAt: ago(0),
    paused: true,
    steps: [
      {
        id: "s-4-1", index: 1, channel: "x", delayDays: 0, scheduledFor: ago(0), status: "skipped",
        draft: "Brian · what we're seeing on euro stablecoin acceptance is wild. Worth comparing notes ?",
        rationale: "High-volume profile · try X first.",
      },
      {
        id: "s-4-2", index: 2, channel: "email", delayDays: 7, scheduledFor: inDays(7), status: "waiting",
        draft: "Brian, came through Emilie's intro on the institutional side. Quick brief attached.",
        rationale: "If X fails, lean on the warm intro through Emilie Choi.",
      },
    ],
  },
];
