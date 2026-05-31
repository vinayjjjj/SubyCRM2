# Suby Contacts — Architecture & Engineering Deep Dive

A complete explanation of everything built, why it was built that way, and how it all connects. Written so you can explain it to a founder or a senior engineer.

---

## The Big Picture

Suby Contacts is a **personal CRM** for a founder managing 50+ relationships across Telegram, WhatsApp, Discord, Slack, X, LinkedIn, and Gmail. The core loop is:

```
Founder talks / messages → App captures → AI processes → Founder gets proactive nudges
```

The entire backend is split into two layers:

1. **HTTP Layer** — Express API that handles requests from the Next.js frontend instantly
2. **Background Layer** — Redis + BullMQ that handles slow/heavy work without blocking the user

---

## Part 1: The Problem With Doing Everything Synchronously

When a user clicks "Generate AI Summary" for a contact, the naive approach is:

```
Browser → API → Call OpenAI (2-5 seconds) → Return result → Browser shows it
```

This is **synchronous** — the browser sits and waits. For one user this is annoying. For multiple users hitting AI at the same time, your server gets jammed.

The solution is to make heavy work **asynchronous**:

```
Browser → API → "Job added, here's your jobId" (instant)
                     ↓
              Worker picks up job in background
                     ↓
              OpenAI call happens (2-5 sec, nobody is waiting)
                     ↓
              Result saved to DB + Redis cache
                     ↓
Browser polls → Gets result
```

This is the **queue pattern** — the most important backend architecture pattern for production apps.

---

## Part 2: Redis — The In-Memory Database

### What is Redis?
Redis is a database that lives entirely in RAM (memory), not on disk. This makes it **10,000x faster** than PostgreSQL for reads/writes. It's used for two things in this project:

### Use 1: The Queue Store
BullMQ uses Redis to store the list of pending jobs. Think of it like a ticket counter:
- When a job is added, a ticket goes into Redis
- Workers pull tickets out of Redis and process them
- Redis tracks which jobs are waiting, active, done, or failed

### Use 2: Caching
Expensive computations (AI summaries, briefings) are cached in Redis so you don't re-run them on every request:

```
contact:{id}:summary     → AI-generated summary text (15 min TTL)
contact:{id}:briefing    → Pre-call briefing (1 hour TTL)
suggestions:{userId}     → Reach-out suggestions (15 min TTL)
```

**TTL (Time To Live)** — after this many seconds, Redis automatically deletes the key. This ensures stale data doesn't live forever.

### Why not just cache in memory?
If you cache in a JavaScript variable (`const cache = {}`), it gets wiped every time the server restarts. Redis survives restarts and can be shared across multiple server processes.

### Running Redis locally
```bash
docker run -d -p 6379:6379 --name suby-redis redis:alpine
```
The `-p 6379:6379` maps the container's Redis port to your laptop's port 6379. The app reads `REDIS_URL=redis://localhost:6379` from `.env.local`.

**File:** `src/server/lib/redis.ts`
```typescript
// Singleton pattern — one Redis connection shared across the whole app
// globalThis prevents creating a new connection on every hot-reload in dev
export const redis = globalThis.__redis ?? new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null  // BullMQ requires this setting
});
```

---

## Part 3: BullMQ — The Job Queue

### What is a Queue?
A queue is a line. First in, first out. Jobs go in one end, workers process them from the other end.

```
[Job 1] [Job 2] [Job 3] [Job 4]  ←  new jobs added here
   ↓
Worker pulls Job 1, processes it
   ↓
Worker pulls Job 2, processes it
```

### What is BullMQ?
BullMQ is a Node.js library that implements job queues on top of Redis. It handles:
- **Adding jobs** to the queue
- **Running workers** that process jobs
- **Retries** when a job fails (with exponential backoff)
- **Scheduled/cron jobs** that repeat on a timer
- **Delayed jobs** that run after a delay (e.g., 30 minutes from now)
- **Job deduplication** — if the same job is already queued, don't add it twice
- **Concurrency** — run N jobs simultaneously per worker

### Three concepts in BullMQ:

**Queue** — the list of pending jobs. You add jobs to it.
```typescript
const job = await queues.aiSummary.add('generate', { contactId: 'abc123' });
// Returns immediately with a jobId — no waiting
```

**Worker** — the code that processes jobs. It runs in the background forever.
```typescript
new Worker('ai-summary', async (job) => {
  const summary = await callOpenAI(job.data.contactId);
  await saveToDatabase(summary);
  // Worker marks job as complete automatically
});
```

**Job** — a unit of work with data attached. Has states: waiting → active → completed/failed.

**File:** `src/server/lib/queues.ts`

---

## Part 4: The 8 Queues We Built

### 1. `ai-classify` — Contact Classification
**Purpose:** Automatically determine a contact's type (VC, partner, friend), domain (fintech, AI, SaaS), and relationship strength (cold, warm, hot).

**Trigger:** User clicks "Classify" button on a contact, or "Classify All" in batch.

**Before BullMQ:** The API called OpenAI synchronously, took 3-5 seconds, blocked the request.

**After BullMQ:**
```
User clicks "Classify" → API enqueues job (instant) → Worker calls OpenAI → Updates contact in DB
```

**Deduplication:** Job ID = contactId, so if you click "Classify" twice quickly, only one job runs.

**Concurrency:** 5 contacts classified simultaneously.

---

### 2. `ai-summary` — AI Contact Summary
**Purpose:** Generate a 2-4 sentence professional summary of a contact based on their interactions, notes, and company.

**Cache-first pattern:**
```
Request comes in
  → Check Redis: contact:{id}:summary
  → Cache hit? Return immediately (instant)
  → Cache miss? Enqueue job, return { status: "queued", jobId }
  → Worker generates summary, saves to DB + Redis (15 min TTL)
  → Next request hits cache
```

**Why 15 min TTL?** Summaries don't change every second. 15 minutes is fresh enough.

---

### 3. `ai-prep` — Pre-Call Briefing
**Purpose:** Before a meeting, generate a briefing: recent activity, talking points, suggested actions.

**Warm cache:** 30 minutes before a calendar event, this job is enqueued automatically via the `outcome-prompt` worker trigger. By the time you open the contact, the briefing is already cached.

**Cache TTL:** 1 hour (longer because you want the same brief throughout the meeting).

---

### 4. `voice-capture` — Voice Note Processing
**Purpose:** Process voice messages into structured CRM actions.

**Full pipeline:**
```
Telegram voice message
  → Download audio file from Telegram servers
  → Send to OpenAI Whisper → Get transcript ("Met with Gaurav, mark him warm")
  → Send transcript to GPT-4o-mini → Parse intent:
    { action: "bumpStrength", contactId: "...", strength: "warm" }
  → Execute action in database
  → Emit SSE event → Voice page refreshes in real time
```

**Why a queue?** Whisper transcription + GPT parsing can take 5-10 seconds. The Telegram webhook needs to respond in 2 seconds or Telegram retries. The queue decouples receiving the message from processing it.

---

### 5. `enrich-contact` — Contact Enrichment
**Purpose:** When a new contact is created, automatically find their LinkedIn, company info, Twitter handle, etc.

**Trigger:** Enqueued automatically after contact creation.

**What it does:** Calls enrichment APIs, updates the contact record with found data (avatar, company, role).

**Why async?** Enrichment hits external APIs, can take 3-10 seconds. The user shouldn't wait for this when creating a contact.

---

### 6. `sequence-tick` — Sequence Advancement
**Purpose:** Every hour, check all active sequence enrollments and advance anyone whose next step is due.

**What is a Sequence?** A series of touchpoints scheduled over time. Example:
```
Step 1: LinkedIn message (Day 0)
Step 2: Wait 3 days
Step 3: Email follow-up (Day 3)
Step 4: Wait 7 days
Step 5: Final follow-up (Day 10)
```

**Important:** This worker only advances the STATUS (pending → due). It does NOT auto-send messages. The founder decides what to send. This is intentional — personal CRM should not auto-spam people.

**Cron:** Runs every hour at `:00` — `0 * * * *`

---

### 7. `daily-brief` — Morning Briefing
**Purpose:** Every morning at 7:55am, build a daily brief and push it to the founder's Telegram before their day starts.

**What's in the brief:**
- Stale VCs you haven't talked to in 30+ days
- Cooling "hot" contacts (strong relationship going cold)
- Overdue reminders
- Today's calendar events (who you're meeting)

**Cron:** `55 7 * * *` (7:55am every day)

**Why 7:55am?** Gives 5 minutes to read before the typical 8am standup.

---

### 8. `outcome-prompt` — Post-Meeting Follow-up
**Purpose:** 30 minutes after a calendar event ends, send a Telegram message: "How did the meeting with [Contact] go?"

**How it works:**
```
Calendar event synced (e.g., meeting ends at 3pm)
  → Calculate delay: 3:30pm - now = X milliseconds
  → Add delayed BullMQ job with { delay: X }
  → BullMQ stores in Redis, fires at exactly 3:30pm
  → Worker sends Telegram message
```

**Why 30 min after?** Enough time for the meeting to actually finish, while it's still fresh.

---

## Part 5: The Worker Architecture

All workers live in `src/server/workers/` and are started inside the same Express process:

```typescript
// src/server/index.ts — inside app.listen callback
const { startAllWorkers } = await import("./workers/index");
startAllWorkers();
```

**Why same process?** Simpler for a solo founder's tool. In a large-scale production app, workers would run in separate processes/containers to scale independently.

**Worker lifecycle:**
```
Server starts
  → Workers connect to Redis
  → Workers poll Redis for jobs (long-polling, very efficient)
  → Job arrives → Worker executes handler → Job marked complete/failed
  → Worker immediately polls for next job
```

**Default job options (applied to every queue):**
```typescript
{
  attempts: 3,           // retry up to 3 times on failure
  backoff: {
    type: 'exponential', // wait 2s, then 4s, then 8s between retries
    delay: 2000,
  }
}
```

---

## Part 6: The Sequence Data Model

Three new Prisma models were added:

### `Sequence` — the template
```
id, name, description, status (active/paused/completed)
  → has many SequenceSteps
  → has many SequenceEnrollments
```

### `SequenceStep` — one step in the sequence
```
id, sequenceId, stepNumber, type (email/linkedin_message/wait/task/...),
delayDays, subject, body
```

### `SequenceEnrollment` — one contact enrolled in one sequence
```
id, sequenceId, contactId, currentStep, status (active/paused/completed/exited),
nextStepDue, enrolledAt, completedAt
```

The `sequence-tick` worker queries:
```sql
SELECT * FROM sequence_enrollments
WHERE status = 'active' AND next_step_due <= NOW()
```
Then advances each one.

---

## Part 7: The Inbox Architecture

The unified inbox (`InboxMessage` table) receives messages from every platform:

| Platform | How messages arrive |
|----------|-------------------|
| Telegram (bot) | Webhook → bot handler → upsert to InboxMessage |
| Telegram (personal) | MTProto listener → upsert to InboxMessage |
| WhatsApp | Baileys WebSocket → message event → upsert |
| Discord | discord.js Client → messageCreate event → upsert |
| Slack | Slack Events API → webhook → upsert |
| X/Twitter | Polling worker → fetch DMs → upsert |
| Gmail | Pub/Sub push notifications → upsert as GmailThread |

**Privacy filter (important):** Only messages from contacts already in the CRM are stored. If a random person messages you on Telegram, it's ignored. The founder's personal messages are not a surveillance tool.

**Conversation grouping:** The inbox groups messages by `contactId + platform`, not by individual messages. One row per conversation, not per message.

---

## Part 8: The OAuth / Integration Architecture

Every external service uses the same pattern:

```
1. Frontend calls GET /api/{service}/connect-url
2. Backend generates signed state (HMAC) + OAuth URL
3. User redirects to OAuth provider (Google, Slack, Discord, etc.)
4. Provider redirects back to /api/{service}/callback
5. Backend exchanges code for tokens, saves to DB ({Service}Token table)
6. Auto-reconnect on server restart reads saved tokens
```

**Why HMAC-signed state?** The OAuth `state` parameter prevents CSRF. We sign `userId:nonce` with HMAC-SHA256 so the callback can verify it's legitimate — without storing anything in memory (which gets lost on hot-reload).

---

## Part 9: The Bull Board Dashboard

Accessible at `http://localhost:4002/admin/queues`

What each column means:
- **Waiting** — jobs queued, worker hasn't picked them up yet
- **Active** — being processed right now
- **Completed** — finished, shows return value and timing
- **Failed** — errored, shows stack trace for debugging
- **Delayed** — scheduled for a future time (outcome-prompt jobs live here)
- **Repeat** — recurring cron jobs (daily-brief, sequence-tick)

Click any job to see its full payload (input data) and result (output data).

---

## Part 10: How to Explain This to a Founder

> "We built the CRM with a proper background job system so nothing blocks the UI. When you classify a contact or generate a summary, it happens in the background and you get the result when it's ready — no waiting. There's a Redis cache so common AI calls don't re-run every time you open a contact. The morning brief, sequence tracking, and post-meeting prompts all run automatically on a schedule. Every messaging integration (Telegram, WhatsApp, Discord, Slack, X) writes to a single unified inbox so you have one place to reply from. The whole thing is designed to feel instant to you while doing the heavy work quietly in the background."

---

## Tech Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 15 + Tailwind | UI |
| Backend | Express 5 + TypeScript | HTTP API |
| Database | PostgreSQL (Supabase) via Prisma | Persistent storage |
| Queue store | Redis (Docker) | Job queue + cache |
| Job queue | BullMQ | Background workers + cron |
| AI | OpenAI GPT-4o-mini + Whisper | Classification, summaries, transcription |
| Auth | better-auth | Session management |
| Telegram | node-telegram-bot-api + GramJS | Bot + personal MTProto |
| WhatsApp | Baileys (WebSocket) | WA Web protocol |
| Discord | discord.js | Bot + OAuth |
| Queue UI | Bull Board | Visual job monitoring |

---

## File Map

```
src/server/
├── lib/
│   ├── redis.ts        ← IORedis singleton
│   ├── queues.ts       ← 8 BullMQ Queue instances
│   ├── cache.ts        ← Redis cache helper (get/set/del + CACHE_KEYS)
│   ├── prisma.ts       ← Prisma client singleton
│   └── auth.ts         ← better-auth config
├── workers/
│   ├── index.ts        ← startAllWorkers() + shutdownWorkers()
│   ├── ai-classify.worker.ts
│   ├── ai-summary.worker.ts
│   ├── ai-prep.worker.ts
│   ├── voice-capture.worker.ts
│   ├── enrich-contact.worker.ts
│   ├── sequence-tick.worker.ts
│   ├── daily-brief.worker.ts
│   └── outcome-prompt.worker.ts
├── services/
│   ├── ai.service.ts         ← classifyContact, generateSummary, generatePrep
│   ├── inbox.service.ts      ← unified inbox logic
│   ├── telegram-bot.service.ts ← voice processing pipeline
│   └── ... (one per integration)
└── routes/
    ├── ai.routes.ts          ← cache-first, enqueue on miss
    ├── sequence.routes.ts    ← CRUD + enroll
    └── ... (one per feature)
```
