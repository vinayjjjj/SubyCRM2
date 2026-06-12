export type ContactType = "vc" | "lead" | "partner" | "friend" | "prospect" | "team" | "advisor" | "media" | "other";
export type ContactDomain = "payment" | "blockchain" | "saas" | "ecommerce" | "ai" | "marketing" | "legal" | "finance" | "other";
export type RelationshipStrength = "cold" | "warm" | "hot";
export type PlatformType = "whatsapp" | "telegram" | "discord" | "linkedin" | "x" | "slack" | "email" | "matrix";
export type ImportJobStatus = "pending" | "running" | "completed" | "failed";
export type ImportSource = "beeper" | "matrix" | "whatsapp_export" | "telegram_api" | "discord_api" | "slack_api" | "manual";

export interface Contact {
  id: string;
  name: string;
  avatar: string | null;
  type: ContactType;
  domain: ContactDomain;
  company: string | null;
  role: string | null;
  relationshipStrength: RelationshipStrength;
  aiSummary: string | null;
  lastContactDate: string | null;
  firstContactDate: string | null;
  contactFrequency: number | null;
  createdAt: string;
  updatedAt: string;
  platforms?: Platform[];
  interactions?: Interaction[];
  notes?: Note[];
  reminders?: Reminder[];
  contactTags?: ContactTag[];
  _count?: { interactions: number; notes: number };
}

export interface Platform {
  id: string;
  contactId: string;
  type: PlatformType;
  platformId: string;
  displayName: string | null;
  profileUrl: string | null;
  createdAt: string;
}

export interface Interaction {
  id: string;
  contactId: string;
  platform: PlatformType;
  direction: string;
  contentSnippet: string | null;
  messageCount: number;
  occurredAt: string;
  createdAt: string;
}

export interface Note {
  id: string;
  contactId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
}

export interface ContactTag {
  id: string;
  contactId: string;
  tagId: string;
  tag?: Tag;
  createdAt: string;
}

export interface ImportJob {
  id: string;
  source: ImportSource;
  status: ImportJobStatus;
  totalFound: number | null;
  imported: number | null;
  deduplicated: number | null;
  errors: number | null;
  errorLog: unknown;
  config: unknown;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ContactStats {
  total: number;
  byType: Record<string, number>;
  byStrength: Record<string, number>;
  byDomain: Record<string, number>;
  stale30: number;
  stale60: number;
  stale90: number;
}

export type ReminderStatus = "pending" | "done" | "dismissed";

export interface Reminder {
  id: string;
  contactId: string;
  content: string;
  dueDate: string;
  status: ReminderStatus;
  createdAt: string;
  contact?: { id: string; name: string };
}

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  sector: string | null;
  size: string | null;
  funding: string | null;
  linkedin: string | null;
  website: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  contactCount?: number;
  contacts?: Contact[];
}
