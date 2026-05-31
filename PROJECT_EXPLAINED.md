# Suby Contacts — Full Project Explanation

---

## What Is This?

Suby Contacts is a **personal CRM** built for a founder (Gaspard) who runs partnerships at Suby — a payments infrastructure company. He deals with 50+ relationships across payment processors (Stripe, Adyen), crypto custodians (Coinbase, Ledger), VCs (Sequoia, a16z), AI/infra partners (Mistral, Vercel, Hugging Face), and fintech adjacencies (Qonto, Ramp).

The problem: standard CRMs (Salesforce, HubSpot) are built for sales teams, not founders doing relationship maintenance. What Gaspard needs is something closer to a **personal memory system** — track who he spoke to, how warm the relationship is, what was discussed, when to follow up, and what to say next.

**The core bet:** Voice-first capture + proactive AI. Send a voice note to a Telegram bot → Whisper transcribes it → Claude extracts who it's about, what action was taken, what follow-up is needed → it gets linked to the right contact → surfaces on the Today view.

---

## Two Processes, One App

The project runs as two separate processes:

| Process | Command | Port |
|---|---|---|
| Frontend (Next.js) | `npm run dev` | **3005** |
| Backend API (Express) | `npm run dev:api` | **4002** |

You also need Redis running (for job queues, when they get wired):
```bash
docker run -p 6379:6379 redis
```

The frontend talks to the backend via `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:4002`).

**Key design choice:** The UI works even when the backend is down. Every page has a mock fallback — if the API returns empty or errors, it shows realistic mock data automatically. This is called the "mock-first pattern" and it's used consistently everywhere.

---

## Project Structure

```
suby-contacts/
├── src/
│   ├── app/                        Next.js App Router pages
│   │   ├── globals.css             Design tokens (CSS variables) + Tailwind config
│   │   ├── layout.tsx              Root HTML shell
│   │   ├── page.tsx                Redirects to /dashboard
│   │   ├── sign-in/page.tsx        Sign-in page (stub)
│   │   └── (dashboard)/            All dashboard pages (protected by AuthGuard)
│   │       ├── layout.tsx          Sidebar + main content wrapper
│   │       └── dashboard/
│   │           ├── page.tsx            Today / Overview
│   │           ├── inbox/              Unified Inbox
│   │           ├── contacts/           Contacts list + detail
│   │           ├── companies/          Companies list + detail
│   │           ├── network/            Network graph
│   │           ├── pipeline/           Deal pipeline (kanban)
│   │           ├── sequences/          Follow-up sequences
│   │           ├── prep/               Pre-call agenda
│   │           ├── reminders/          Reminders kanban
│   │           ├── voice/              Voice capture history
│   │           ├── settings/           Integration toggles
│   │           └── import/             Import job history
│   ├── components/
│   │   ├── ui/                     shadcn/ui components (Button, Card, Badge, etc.)
│   │   ├── sidebar.tsx             Left nav with overdue badge
│   │   ├── platform-icon.tsx       Icon for each platform type
│   │   └── auth-guard.tsx          Redirects to /sign-in if no session
│   ├── lib/
│   │   ├── types.ts                All shared TypeScript types
│   │   ├── api.ts                  API client (fetch wrapper + all endpoint helpers)
│   │   ├── utils.ts                cn() and other helpers
│   │   ├── auth-client.ts          Frontend better-auth client
│   │   ├── mock-contacts.ts        49 mock contacts
│   │   ├── mock-companies.ts       22 mock companies
│   │   ├── mock-reminders.ts       14 mock reminders
│   │   ├── mock-events.ts          15 calendar events
│   │   ├── mock-pipeline.ts        12 deals across 6 stages
│   │   ├── mock-sequences.ts       4 follow-up sequences
│   │   ├── mock-inbox.ts           10 inbox messages
│   │   ├── mock-voice-captures.ts  8 voice captures + 3 simulator templates
│   │   └── mock-suggestions.ts     Reach-out scoring engine (real logic, not static)
│   └── server/                     Express backend (separate process)
│       ├── index.ts                App setup, route mounting
│       ├── lib/
│       │   ├── prisma.ts           Prisma client singleton
│       │   ├── anthropic.ts        Anthropic SDK setup
│       │   └── auth.ts             better-auth config
│       ├── middlewares/
│       │   ├── auth.ts             requireAuth middleware
│       │   └── error.ts            Global error handler
│       ├── routes/                 Express routers (7 routers)
│       │   ├── contact.routes.ts
│       │   ├── company.routes.ts
│       │   ├── reminder.routes.ts
│       │   ├── tag.routes.ts
│       │   ├── note.routes.ts
│       │   ├── ai.routes.ts
│       │   └── import.routes.ts
│       ├── services/               Business logic
│       │   ├── contact.service.ts
│       │   ├── ai.service.ts
│       │   ├── enrichment.service.ts
│       │   ├── import.service.ts
│       │   └── dedup.service.ts
│       ├── import/
│       │   └── beeper.ts           Beeper/Matrix importer
│       └── cron/
│           └── staleCheck.ts       Daily 8am stale contact detector
├── prisma/
│   ├── schema.prisma               Full Postgres schema
│   └── seed-demo.ts                Demo data seed script
├── public/
│   └── suby-logo.svg
├── HANDOFF.html                    Comprehensive handoff spec document
├── PROJECT_EXPLAINED.md            This file
├── package.json
├── next.config.ts
├── tailwind.config.ts
└── components.json                 shadcn/ui config
```

---

## Data Models

Everything radiates from the `Contact`. Here are all the entities:

### Contact
The main record. Represents a person with full relationship metadata.

```typescript
interface Contact {
  id: string
  name: string
  avatar: string | null
  
  // Classification (AI can fill these)
  type: "vc" | "lead" | "partner" | "friend" | "prospect" | "team" | "advisor" | "media" | "other"
  domain: "payment" | "blockchain" | "saas" | "ecommerce" | "ai" | "marketing" | "legal" | "finance" | "other"
  relationshipStrength: "cold" | "warm" | "hot"
  
  // Who they are
  company: string | null        // legacy text field
  companyId: string | null      // FK to Company table
  role: string | null
  
  // AI-generated
  aiSummary: string | null
  
  // Interaction tracking
  lastContactDate: string | null     // ISO date of most recent interaction
  firstContactDate: string | null
  contactFrequency: number | null    // estimated days between contacts
  
  createdAt: string
  updatedAt: string
  
  // Relations (included when fetching single contact)
  platforms?: Platform[]         // how to reach them
  interactions?: Interaction[]   // every message/mention
  notes?: Note[]                 // free-form notes with #hashtags
  contactTags?: ContactTag[]     // tag assignments
  reminders?: Reminder[]         // follow-up reminders
  _count?: { interactions: number; notes: number }
}
```

### Company
Organizations. Contacts can be linked to a company.

```typescript
interface Company {
  id: string
  name: string
  domain: string | null       // e.g. "stripe.com"
  sector: string | null       // "payment", "vc", "ai", etc.
  size: "startup" | "scaleup" | "enterprise" | null
  funding: string | null      // "series-c", "public", etc.
  linkedin: string | null
  website: string | null
  description: string | null
  createdAt: string
  updatedAt: string
  
  contactCount?: number
  contacts?: Contact[]
}
```

### Platform
A communication handle for a contact. One contact can have multiple platforms.

```typescript
interface Platform {
  id: string
  contactId: string
  type: "whatsapp" | "telegram" | "discord" | "linkedin" | "x" | "slack" | "email" | "matrix"
  platformId: string         // the actual handle/username
  displayName: string | null
  profileUrl: string | null
  createdAt: string
}
```

### Interaction
A single message or engagement event. Feeds `lastContactDate` and `contactFrequency`.

```typescript
interface Interaction {
  id: string
  contactId: string
  platform: PlatformType
  direction: "inbound" | "outbound"
  contentSnippet: string | null    // first ~200 chars of message
  messageCount: number             // for grouped message batches
  occurredAt: string               // ISO date of the actual message
  createdAt: string
}
```

### Note
Free-form annotation on a contact. Supports `#hashtags` which auto-create Tags.

```typescript
interface Note {
  id: string
  contactId: string
  content: string      // e.g. "Discussed Series B timeline #crypto #vc"
  createdAt: string
  updatedAt: string
}
```

### Tag
User-defined labels. Created when you write `#tagname` in a note, or manually.

```typescript
interface Tag {
  id: string
  name: string        // unique
  color: string | null
  createdAt: string
}
```

### Reminder
Time-bound action items. Shown in a kanban (Overdue / Today / This week / Later). Badge on sidebar shows overdue count.

```typescript
interface Reminder {
  id: string
  contactId: string
  content: string
  dueDate: string
  status: "pending" | "done" | "dismissed"
  createdAt: string
  
  contact?: { id: string; name: string }
}
```

### ImportJob
Tracks the history of contact imports from Beeper, WhatsApp exports, Telegram, etc.

```typescript
interface ImportJob {
  id: string
  source: "beeper" | "matrix" | "whatsapp_export" | "telegram_api" | "discord_api" | "slack_api" | "manual"
  status: "pending" | "running" | "completed" | "failed"
  totalFound: number | null
  imported: number | null
  deduplicated: number | null
  errors: number | null
  errorLog: unknown         // JSON
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}
```

---

## Every Page Explained

### 1. Today / Overview — `/dashboard`
**Status: Mock-only**

The daily command center. Shows what matters right now:

- **Daily brief** — A preview of the 8am Telegram push. Lists today's calls, top reach-outs, overdue items.
- **Weekly KPIs** — Calls this week, hot contacts, new contacts this week.
- **"How did it go?"** — Calls from the past 3 days waiting for a rating (Strong / OK / Cold / No-show). This feeds the relationship strength score.
- **Today's agenda** — Calendar events for today with direct Zoom/Meet join links.
- **Overdue reminders** — Quick "Done" button to close them.
- **Reach-outs to do** — Top 4 AI-scored suggestions. Each one has a copy-ready draft message, a Regenerate button, and a Skip button.

The reach-out scoring is the most interesting part. `mock-suggestions.ts` contains a real scoring engine (not static data). It factors in: days since last contact, relationship strength, contact type (vc > lead > partner > other), company sector priority. Score 0-100 → urgency level → preferred channel (telegram > x > linkedin > email) → templated draft.

---

### 2. Inbox — `/dashboard/inbox`
**Status: Mock-only**

Unified inbox across all messaging platforms. Designed like Superhuman:

- Left panel: message list with sender, preview, timestamp, platform icon
- Right panel: full thread + reply pane
- Filters: All / Unread / Needs reply / Starred
- Sources: Telegram, X DMs, Email, LinkedIn, Discord

In production, this needs real webhook wiring for each platform. The mock shows what the UX will feel like.

---

### 3. Contacts — `/dashboard/contacts` and `/dashboard/contacts/[id]`
**Status: API + mock fallback**

**List view:**
- Search by name/company/role
- Filter by type (VC, Lead, Partner, etc.) via tabs with counts
- Filter by domain (Payment, Blockchain, AI, etc.) via dropdown
- "Classify All (AI)" button — sends batch to `/api/ai/classify-batch` (currently stub, needs real Claude wiring)
- Table: Name + role/company, Platforms (icons), Type badge, Domain badge, Last contact (relative), Frequency, Strength badge

**Detail view:**
- Contact header: name, role, company, avatar, type/domain/strength badges
- Platforms: clickable icons with handle tooltips
- **Unified timeline**: interactions + notes + reminders + calendar events merged and sorted by date. Shows the full history of the relationship in one scroll.
- Notes composer: type a note, `#hashtags` auto-create tags. Tags appear as chips.
- Edit panel: update name, company, role, type, domain, strength inline.
- Reminders section: create and manage follow-up dates.
- "Summary (AI)" button → POST to `/api/ai/summary/:id` (currently stub).

---

### 4. Companies — `/dashboard/companies` and `/dashboard/companies/[id]`
**Status: API + mock fallback**

**List view (split panel):**
- Left: searchable, filterable company list (by sector)
- Right: company detail appears inline — no navigation needed

**Detail view:**
- Company name, website, sector badge, size badge, funding badge
- Description
- Linked contacts with role and relationship strength
- KPI bar: contact count, hot contacts, last interaction
- "Assign contact" button → bulk assign contacts to this company

---

### 5. Network — `/dashboard/network`
**Status: Mock-only**

SVG force-layout relationship graph. Deterministic (no physics animation library — uses pre-computed positions).

- Center node = "You"
- Contacts grouped by sector, clustered around sector hubs
- Node size = relationship strength (hot > warm > cold)
- Hot contacts have a colored halo
- Sector pill filters at top — click a sector to highlight that cluster and show a side panel listing those contacts
- 7 sectors: payment, blockchain, vc, infra, fintech, ai, other

---

### 6. Pipeline — `/dashboard/pipeline`
**Status: Mock-only (in-memory only, no persistence)**

Kanban deal board with 6 stages:
**Intro → First call → Tech review → Term sheet → Live → Lost**

Each deal card shows:
- Company logo + name
- Contact name
- Next step description
- Monthly value (MRR)
- Probability bar
- Age warning — yellow if deal is >14 days old in same stage

Header KPIs: total open deals, weighted pipeline value, live MRR.

Drag-and-drop between columns works but doesn't persist — refresh resets.

---

### 7. Sequences — `/dashboard/sequences`
**Status: Mock-only**

Multi-step follow-up automation sequences. Think of it as a personal drip campaign.

Each sequence has:
- A goal (e.g., "Warm up cold VC contacts for Series A")
- Ordered steps with: channel (Telegram/email/LinkedIn), delay (e.g., "+3 days"), draft message, rationale
- Step status: Sent / Scheduled / Waiting / Skipped

There's no automatic sending — the user copies the draft and sends manually. The `sequence-tick` BullMQ job (not yet wired) would handle automatic progression.

---

### 8. Pre-call — `/dashboard/prep`
**Status: Mock-only (client-side generation)**

Weekly agenda grid (Mon→Sun, 8am→8pm). Events are color-coded by channel.

Click any event → modal pops with:
- Contact name, company, scheduled time
- "Join Zoom/Meet" direct link
- AI pre-call brief with 4 sections:
  - **Context**: who they are, relationship history
  - **Recent activity**: what happened since last contact
  - **Talking points**: suggested topics for this call
  - **Action items**: what to push for in this meeting

Currently uses templated client-side generation. In production: POST to `/api/ai/prep/:id` for a real Claude-generated brief.

---

### 9. Reminders — `/dashboard/reminders`
**Status: API + mock fallback**

4-column kanban:
- **Overdue** (red header)
- **Today**
- **This week**
- **Later**

Cards show contact name + last-interaction platform icon + reminder text + due date. Hover → "Done" button marks it complete. The sidebar shows a red badge with overdue count.

---

### 10. Voice — `/dashboard/voice`
**Status: Mock-only (real pipeline lives in `suby-operation` repo)**

Shows history of voice notes sent to `@subyassist_bot` on Telegram.

Each capture displays:
- Mini waveform visualization
- Full transcript (from Whisper)
- Detected contact name
- Extracted actions (e.g., note / reminder / strength_bump / tag / no_action)

**Simulator panel**: Click "Try a capture" → choose from 3 sample transcripts → watch the pipeline run: transcribe → extract → link to contact → create action. This demos the full voice-first workflow without needing the real Telegram bot.

The real pipeline lives in a separate repo (`suby-operation`): Telegram bot receives voice message → downloads audio → OpenAI Whisper transcribes → Claude with tool-use extracts structured data → writes to Postgres → SSE pushes update to frontend.

---

### 11. Settings — `/dashboard/settings`
**Status: Mock-only (simulated OAuth)**

Integration cards grouped by category:
- **Voice**: Telegram bot connection
- **Calendar & Email**: Google Calendar, Gmail
- **Messaging**: Beeper (Matrix bridge), WhatsApp, Discord, Slack
- **Social**: LinkedIn, X/Twitter

Connect/Disconnect toggles simulate OAuth with a 700ms delay. Clicking "Import & sync history" navigates to `/dashboard/import`.

---

### 12. Import — `/dashboard/import`
**Status: API + mock fallback**

Shows import sources and job history.

**Sources:**
- Beeper — has a real "Run import" button that POSTs to `/api/imports/beeper` with Matrix credentials
- WhatsApp, Telegram, Discord, Slack — buttons exist but are stubs

**Job history table:**
- Each row shows: source, status (pending/running/completed/failed), found count, imported count, deduped count, errors, start/end time

---

## The API Client

`/src/lib/api.ts` is the single place all fetch calls happen. It's a thin wrapper around `fetch` with:
- Base URL from env
- `credentials: "include"` for session cookies
- `cache: "no-store"` so data is always fresh
- JSON body serialization

```typescript
// Example usage in a component:
contactsApi.getAll({ type: "vc", search: "stripe", page: "1" })
contactsApi.getById("abc123")
contactsApi.update("abc123", { relationshipStrength: "hot" })
aiApi.classifyBatch()
remindersApi.getDue()
```

Full list of available methods:

```
contactsApi   — getAll, getById, getStats, create, update, delete,
                merge, enrich, addNote, deleteNote, addTag, removeTag
companiesApi  — getAll, getById, create, update, assignContacts
remindersApi  — getAll, getDue, create, update, delete
tagsApi       — getAll, create
importApi     — getJobs, runBeeper
aiApi         — classify, summary, prep, classifyBatch, alerts
```

---

## The Mock-First Pattern

Every single page follows this exact pattern:

```typescript
useEffect(() => {
  api.getAll(params)
    .then((res) => {
      if (res.data?.length) {
        setData(res.data)          // real API data if available
      } else {
        setData(filterMock(params))  // mock fallback if empty
      }
    })
    .catch(() => {
      setData(filterMock(params))    // mock fallback on error
    })
}, [params])
```

This means:
- App renders perfectly with zero backend
- Once you add real data to Postgres, the mock disappears automatically (without any code change)
- Great for demos — always looks populated

---

## Backend: Routes, Services, and What's Real

### What's actually wired to Postgres:

| Feature | Status |
|---|---|
| Contacts CRUD | Real |
| Notes CRUD | Real |
| Tags | Real |
| Companies CRUD | Real |
| Reminders CRUD | Real |
| Contact stats (counts) | Real |
| AI classify / summary / prep | **Stub** — routes exist, return placeholder |
| Deals / Pipeline | Mock-only |
| Sequences | Mock-only |
| Calendar events | Mock-only |
| Inbox messages | Mock-only |
| Voice captures | Mock-only |

### All API endpoints:

```
# Contacts
GET    /api/contacts                  list with filters
GET    /api/contacts/stats            aggregated counts
GET    /api/contacts/:id              single contact + all relations
POST   /api/contacts                  create
PATCH  /api/contacts/:id              update
DELETE /api/contacts/:id              delete
POST   /api/contacts/merge            merge two contacts (dedup)
POST   /api/contacts/:id/enrich       enrich from public data (stub)
POST   /api/contacts/:id/notes        add note
DELETE /api/contacts/:id/notes/:nid   delete note
POST   /api/contacts/:id/tags         add tag
DELETE /api/contacts/:id/tags/:tid    remove tag
POST   /api/contacts/:id/reminders    create reminder

# Reminders
GET    /api/reminders                 list all
GET    /api/reminders/due             overdue only
PUT    /api/reminders/:id             update (status, dueDate)
DELETE /api/reminders/:id             delete

# Companies
GET    /api/companies                 list all
GET    /api/companies/:id             single + contacts
POST   /api/companies                 create
PUT    /api/companies/:id             update
POST   /api/companies/:id/assign      bulk assign contacts

# Tags
GET    /api/tags                      list all
POST   /api/tags                      create

# AI (all stubs — need real Claude calls)
POST   /api/ai/classify/:id           classify contact type/domain/strength
POST   /api/ai/summary/:id            generate AI summary
POST   /api/ai/prep/:id               generate pre-call briefing
POST   /api/ai/classify-batch         batch classify all unclassified
GET    /api/ai/alerts                 get AI-generated alerts

# Import
GET    /api/import/jobs               job history
POST   /api/imports/beeper            trigger Beeper import

# Auth
/api/auth/*                           delegated to better-auth
```

### Services (business logic layer):

**contactService** — All contact operations. The `getAll` method builds a dynamic Prisma query from filter params. `merge` consolidates two contacts by moving all their interactions, notes, reminders, and tags onto the target contact.

**aiService** — Wraps Anthropic SDK. Three methods that need real prompts wired:
- `classifyContact(contact)` → returns `{ type, domain, strength }`
- `generateSummary(contact)` → returns markdown summary string
- `generatePrep(contact)` → returns brief with Context/Recent activity/Talking points/Action items

**dedupService** — Finds potential duplicates by fuzzy-matching name + company + email. Powers the merge flow.

**importService** — Orchestrates the Beeper import: fetch messages from Matrix, parse contacts, deduplicate against existing, persist new contacts + interactions.

**enrichmentService** — Public data enrichment from LinkedIn/X (not yet wired).

---

## AI Features

### What's planned vs. what works:

| Feature | Page | Plan | Current State |
|---|---|---|---|
| Contact classification | Contacts list | Claude fills type/domain/strength | Stub — returns placeholder |
| Contact summary | Contact detail | Claude summarizes from interactions + notes | Stub |
| Pre-call brief | Pre-call modal | Claude generates 4-section brief | Client-side template |
| Reach-out suggestions | Today page | Score contacts → draft personalized message | Scoring is real logic; drafts are templates |
| Voice pipeline | Voice page | Telegram → Whisper → Claude tool-use → Postgres | Real pipeline in `suby-operation` repo |
| Daily brief | Today page | 8am push via Telegram bot | Mock preview only |

### The Reach-out Scoring Engine

`mock-suggestions.ts` is the most interesting mock file — it's not static data, it's real scoring logic:

1. Starts with all contacts
2. Filters out contacts interacted with in the last 7 days
3. Scores each remaining contact on 0-100:
   - Days since last contact (up to 40 points)
   - Relationship strength: hot=30, warm=20, cold=10
   - Contact type priority: vc=15, lead=12, partner=10, friend=8, others less
   - Domain priority: payment=10, blockchain=8, ai=8, saas=6, others less
4. Assigns urgency: ≥60 = high, ≥35 = medium, <35 = low
5. Picks preferred channel: telegram > x > linkedin > email (based on contact's platforms)
6. Generates a draft message template based on sector/type/strength combination

In production, this engine moves to the backend as a BullMQ job, and the drafts become real Claude calls with full contact context.

---

## Tech Stack Summary

### Frontend
| Tool | Version | Why |
|---|---|---|
| Next.js | 16, App Router | Server components, routing, fast builds |
| React | 19 | Latest stable |
| TypeScript | 5.7 | Type safety across frontend + backend |
| Tailwind CSS | 4.2.2 | Utility-first, design tokens via `@theme inline` |
| shadcn/ui | Latest | Radix primitives + CVA, fully owned components |
| lucide-react | Latest | Icon library |
| better-auth | Latest | Session management (not yet fully wired) |

### Backend
| Tool | Version | Why |
|---|---|---|
| Express | 5 | Lightweight HTTP server |
| Prisma | 6 | Schema-first ORM, migrations, type-safe queries |
| PostgreSQL | — | Relational DB — Supabase today, Scaleway planned |
| better-auth | — | Auth with Prisma adapter |
| BullMQ | — | Job queues (planned) |
| Redis | — | Queue backend + caching (planned) |
| Anthropic SDK | — | Claude for classify/summary/prep/voice |
| OpenAI SDK | — | Whisper for voice transcription |
| express-rate-limit | — | 2000 req/15min limit |

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | What it does | Required now? |
|---|---|---|
| `DATABASE_URL` | Postgres pooled URL (Supabase) | Yes |
| `DIRECT_URL` | Postgres direct URL (for Prisma migrations) | Yes |
| `NEXT_PUBLIC_API_URL` | Frontend points to backend | Defaults to localhost:4002 |
| `FRONTEND_URL` | For CORS + auth redirects | Yes |
| `BETTER_AUTH_SECRET` | Session signing key (`openssl rand -base64 32`) | When auth is wired |
| `BETTER_AUTH_URL` | Auth base URL | When auth is wired |
| `ANTHROPIC_API_KEY` | Claude API key | When AI endpoints are wired |
| `OPENAI_API_KEY` | Whisper transcription | When voice pipeline runs locally |
| `REDIS_URL` | Redis connection | When BullMQ jobs are wired |
| `GOOGLE_CLIENT_ID` | Google OAuth | When calendar integration is wired |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | When calendar integration is wired |
| `API_PORT` | Override backend port | Optional (default 4002) |

---

## Styling System

The project uses **Tailwind CSS v4** with a custom design token system.

All design tokens live in `globals.css` as CSS variables in `:root`:
```css
:root {
  --bg: #fafafa;          /* page background */
  --sf: #ffffff;          /* card/surface */
  --bd: #e5e7eb;          /* border */
  --t1: #111827;          /* primary text */
  --t2: #6b7280;          /* secondary text */
  --t3: #9ca3af;          /* muted/placeholder text */
  --ac: #111827;          /* accent (buttons, focus rings) */
  --al: #f3f4f6;          /* alt surface (hover states) */

  /* Status colors (bg + text pair for each) */
  --gb: #f0fdf4; --gc: #16a34a;   /* green */
  --yb: #fefce8; --yc: #ca8a04;   /* yellow */
  --bb: #eff6ff; --bc: #2563eb;   /* blue */
  --rb: #fef2f2; --rc: #dc2626;   /* red */
  --pb: #eef2ff; --pc: #4f46e5;   /* purple */
  --ob: #fff7ed; --oc: #ea580c;   /* orange */

  --r: 8px;    /* border-radius small */
  --r2: 12px;  /* border-radius medium */
}
```

The `@theme inline` block in `globals.css` maps these to Tailwind utility names:
```css
@theme inline {
  --color-background: var(--bg);
  --color-foreground: var(--t1);
  --color-border: var(--bd);
  --color-card: var(--sf);
  --color-status-green-bg: var(--gb);
  --color-status-green: var(--gc);
  /* ... all tokens */
}
```

This means you can use `bg-card`, `text-foreground`, `border-border` in Tailwind classes, and they resolve to the correct CSS variable at runtime.

---

## How to Run

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env.local
# Fill in DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_API_URL, FRONTEND_URL

# 3. Set up database
npx prisma generate
npx prisma migrate dev   # or: npm run db:push

# 4. (Optional) Seed demo data
npm run db:seed:demo

# 5. Run everything (3 terminals)
npm run dev          # Terminal 1: Frontend on :3005
npm run dev:api      # Terminal 2: Backend on :4002
docker run -p 6379:6379 redis  # Terminal 3: Redis (for when queues are wired)
```

App is at `http://localhost:3005`.

Without the backend running, the UI still works (all mock fallbacks kick in).

---

## What's Left to Build

In priority order from the HANDOFF:

### Immediate (half a day each)
1. **Wire better-auth** — single-user email/password or Google OAuth
2. **Wire AI endpoints** — real Anthropic Claude calls for `/api/ai/classify/:id`, `/summary/:id`, `/prep/:id`
3. **Set up all env vars** properly for a staging environment

### Medium (1-3 days each)
4. **Redis + BullMQ** — 8 queues: `voice-capture`, `ai-classify`, `ai-summary`, `ai-prep`, `enrich-contact`, `sequence-tick`, `daily-brief`, `outcome-prompt`
5. **Google Calendar integration** — OAuth + event pull + contact matching
6. **Beeper import** — Matrix client + dedup + contact creation
7. **Persist Deals** — Prisma model + routes + swap `MOCK_PIPELINE`
8. **Persist Sequences** — Prisma model + routes + `sequence-tick` job

### Larger (1+ week each)
9. **Voice capture pipeline** — `suby-operation` repo: Telegram bot → Whisper → Claude tool-use → Postgres → SSE push to frontend
10. **Unified inbox** — real connectors for Telegram, X, Gmail, LinkedIn
11. **Meeting outcome loop** — 30 min after event → prompt via bot → update strength
12. **Daily morning brief** — 7:55am cron → Claude drafts the brief → Telegram push at 8am

---

## The Separate Repo: `suby-operation`

The Telegram bot (`@subyassist_bot`) lives in a completely separate repo. It handles:

1. **Voice note reception** — Telegram webhook receives audio file
2. **Transcription** — Downloads audio, sends to OpenAI Whisper
3. **Extraction** — Sends transcript to Claude with tool-use. Claude calls tools like:
   - `createNote(contactId, content)`
   - `createReminder(contactId, dueDate, content)`
   - `updateStrength(contactId, strength)`
   - `addTag(contactId, tagName)`
4. **Persistence** — Writes results to the same Postgres database
5. **Push to frontend** — SSE event tells the Voice page to refresh

The Voice page in this repo shows the history of what the bot has processed and includes a simulator to demo the flow without the real bot.
