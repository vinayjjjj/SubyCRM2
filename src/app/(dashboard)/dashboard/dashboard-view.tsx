"use client";

import { useState, useEffect, useMemo } from "react";
import { remindersApi, calendarApi, aiApi, meApi, contactsApi, type AlertApi, type CalendarEventApi } from "@/lib/api";
import type { RelationshipStrength } from "@/lib/types";
import { PlatformIcon } from "@/components/platform-icon";
import type { Reminder, PlatformType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type CallChannel = "zoom" | "meet" | "phone" | "in_person" | "telegram" | "x_space";

const CHANNEL_META: Record<CallChannel, { label: string; icon: string; color: string; bg: string }> = {
  zoom:      { label: "Zoom",      icon: "🎥", color: "#2D8CFF", bg: "#2D8CFF15" },
  meet:      { label: "Meet",      icon: "📹", color: "#34A853", bg: "#34A85315" },
  phone:     { label: "Phone",     icon: "📞", color: "var(--gc)", bg: "var(--gb)" },
  in_person: { label: "In person", icon: "🤝", color: "var(--oc)", bg: "var(--ob)" },
  telegram:  { label: "Telegram",  icon: "✈️", color: "#229ED9", bg: "#229ED915" },
  x_space:   { label: "X Space",   icon: "🎙️", color: "var(--t1)", bg: "var(--al)" },
};

function fmtTime(d: Date) {
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("");
}
function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
function BriefIcon({ path, color, size = 13 }: { path: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, verticalAlign: "-2px" }} aria-hidden>
      <path d={path} />
    </svg>
  );
}
function SectionHead({ title, count, tone }: { title: string; count: number; tone?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="text-[15px] font-bold text-foreground" style={tone ? { color: tone } : undefined}>{title}</h2>
      <span className="text-[11px] text-muted-foreground tabular-nums">{count}</span>
    </div>
  );
}

const OUTCOME_OPTIONS = [
  { value: "strong",  label: "Strong",  bg: "var(--gb)", color: "var(--gc)", icon: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" },
  { value: "ok",      label: "OK",      bg: "var(--bb)", color: "var(--bc)", icon: "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3" },
  { value: "cold",    label: "Cold",    bg: "var(--al)", color: "var(--t2)", icon: "M12 2v20 M2 12h20 M19 5l-14 14 M5 5l14 14" },
  { value: "noshow",  label: "No-show", bg: "var(--rb)", color: "var(--rc)", icon: "M18.36 6.64a9 9 0 1 1-12.73 0 M12 2v10" },
] as const;

const URGENCY_COLOR: Record<string, { color: string }> = {
  high:   { color: "var(--rc)" },
  medium: { color: "var(--oc)" },
  low:    { color: "var(--t3)" },
};

export function DashboardView() {
  const [userName, setUserName] = useState<string | null>(null);
  const [overdueReminders, setOverdueReminders] = useState<Reminder[]>([]);
  const [todayEvents, setTodayEvents] = useState<CalendarEventApi[]>([]);
  const [pastEvents, setPastEvents] = useState<CalendarEventApi[]>([]);
  const [weeklyPulse, setWeeklyPulse] = useState({ calls: 0, hot: 0, newContacts: 0 });
  const [alerts, setAlerts] = useState<AlertApi[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("suby_dismissed_alerts") ?? "[]")); } catch { return new Set(); }
  });
  const [outcomes, setOutcomes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("suby_call_outcomes") ?? "{}"); } catch { return {}; }
  });
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);

  useEffect(() => {
    // User name
    meApi.get().then((u) => setUserName(u.name ?? u.email ?? null)).catch(() => {});

    // Overdue reminders
    remindersApi.getDue()
      .then((r) => setOverdueReminders(r ?? []))
      .catch(() => {});

    // Calendar events
    const now = new Date();
    const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setUTCHours(23, 59, 59, 999);
    const weekAgo = new Date(now.getTime() - 7 * 86400_000);
    const weekEnd = new Date(now.getTime() + 7 * 86400_000);

    calendarApi.getEvents(todayStart.toISOString(), todayEnd.toISOString())
      .then(setTodayEvents).catch(() => {});

    calendarApi.getEvents(weekAgo.toISOString(), now.toISOString())
      .then((evs) => {
        const past = evs.filter((e) => new Date(e.end).getTime() < now.getTime() && (now.getTime() - new Date(e.end).getTime()) < 3 * 86400_000);
        setPastEvents(past);
      }).catch(() => {});

    calendarApi.getEvents(new Date(now.getTime() - 7 * 86400_000).toISOString(), weekEnd.toISOString())
      .then((evs) => {
        const thisWeek = evs.filter((e) => {
          const d = new Date(e.start);
          const dow = (now.getDay() + 6) % 7;
          const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - dow); weekStart.setHours(0, 0, 0, 0);
          return d >= weekStart;
        });
        setWeeklyPulse((prev) => ({ ...prev, calls: thisWeek.length }));
      }).catch(() => {});

    // Real contacts stats
    contactsApi.getAll({ limit: "1" })
      .then(() => {})
      .catch(() => {});

    contactsApi.getAll({ strength: "hot", limit: "500" })
      .then((r) => setWeeklyPulse((prev) => ({ ...prev, hot: r.total })))
      .catch(() => {});

    // AI alerts (slow — runs GPT)
    aiApi.alerts()
      .then((a) => setAlerts(a))
      .catch(() => setAlerts([]))
      .finally(() => setAlertsLoading(false));
  }, []);

  const markReminderDone = (id: string) => {
    setOverdueReminders((prev) => prev.filter((r) => r.id !== id));
    remindersApi.update(id, { status: "done" }).catch(() => {});
  };

  const OUTCOME_TO_STRENGTH: Record<string, RelationshipStrength | null> = {
    strong: "hot",
    ok: "warm",
    cold: "cold",
    noshow: null,
    dismissed: null,
  };

  const logOutcome = (event: CalendarEventApi, outcome: string) => {
    setOutcomes((prev) => {
      const next = { ...prev, [event.id]: outcome };
      try { localStorage.setItem("suby_call_outcomes", JSON.stringify(next)); } catch {}
      return next;
    });
    const strength = OUTCOME_TO_STRENGTH[outcome];
    if (!event.contactId || !strength) return;
    contactsApi.update(event.contactId, {
      relationshipStrength: strength,
      lastContactDate: event.start,
    }).catch(() => {});
  };

  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.contactId));

  const firstName = userName?.split(" ")[0] ?? "there";

  return (
    <div className="flex flex-col gap-7 max-w-[980px] w-full">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">{greeting()}, {firstName}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {[
            todayEvents.length > 0 ? `${todayEvents.length} call${todayEvents.length > 1 ? "s" : ""} today` : null,
            overdueReminders.length > 0 ? `${overdueReminders.length} overdue` : null,
            visibleAlerts.length > 0 ? `${visibleAlerts.length} reach-out${visibleAlerts.length > 1 ? "s" : ""} to do` : null,
          ].filter(Boolean).join(" · ") || "All caught up."}
        </p>
      </div>

      {/* Daily brief */}
      <DailyBriefCard
        todayEvents={todayEvents}
        overdueCount={overdueReminders.length}
        topAlert={visibleAlerts[0] ?? null}
        firstName={firstName}
      />

      {/* Weekly pulse */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Calls this week", value: weeklyPulse.calls },
          { label: "Hot contacts",    value: weeklyPulse.hot,        color: "var(--rc)" },
          { label: "Overdue follow-ups", value: overdueReminders.length, color: overdueReminders.length > 0 ? "var(--oc)" : undefined },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card shadow-sm p-4">
            <div className="text-xs font-medium text-muted-foreground mb-1">{s.label}</div>
            <div className="text-[22px] font-bold tabular-nums tracking-tight" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Past calls awaiting outcome */}
      {pastEvents.filter((e) => !outcomes[e.id]).length > 0 && (
        <section>
          <SectionHead title="How did it go?" count={pastEvents.filter((e) => !outcomes[e.id]).length} tone="var(--bc)" />
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            {pastEvents.filter((e) => !outcomes[e.id]).slice(0, 4).map((e, idx, arr) => (
              <OutcomeRow key={e.id} event={e} isLast={idx === arr.length - 1}
                onPick={(outcome) => logOutcome(e, outcome)} />
            ))}
          </div>
        </section>
      )}

      {/* Today's calls */}
      <section>
        <SectionHead title="Today's calls" count={todayEvents.length} />
        {todayEvents.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-sm p-7 text-center text-[13px] text-muted-foreground">
            No calls scheduled today.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {todayEvents.map((e) => <TodayCallRow key={e.id} event={e} />)}
          </div>
        )}
      </section>

      {/* Overdue reminders */}
      {overdueReminders.length > 0 && (
        <section>
          <SectionHead title="Overdue reminders" count={overdueReminders.length} tone="var(--rc)" />
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            {overdueReminders.map((r, idx) => (
              <div key={r.id} className={cn("flex items-center gap-3 p-3 px-4", idx < overdueReminders.length - 1 && "border-b border-border")}>
                <span className="size-2 rounded-full bg-status-red shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-foreground">{r.content}</div>
                  <div className="text-[11px] text-status-red mt-0.5">
                    {r.contact?.name} · Due {new Date(r.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => markReminderDone(r.id)}>Done</Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* AI reach-outs */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[15px] font-bold text-foreground">Reach-outs to do</h2>
          <Badge variant="purple" className="text-[10px]">AI</Badge>
          {!alertsLoading && <span className="text-[11px] text-muted-foreground">{visibleAlerts.length}</span>}
        </div>

        {alertsLoading ? (
          <div className="rounded-xl border border-border bg-card shadow-sm p-8 text-center text-[13px] text-muted-foreground">
            <span className="inline-block size-3.5 mr-2 align-middle border-2 border-current border-t-transparent rounded-full animate-spin" />
            Analysing your network…
          </div>
        ) : visibleAlerts.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-sm p-8 text-center text-[13px] text-muted-foreground">
            You're all caught up. No priority reach-outs.
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            {visibleAlerts.slice(0, 4).map((a, idx) => (
              <ReachOutRow key={a.contactId} alert={a} last={idx === Math.min(visibleAlerts.length, 4) - 1}
                expanded={expandedDraft === a.contactId}
                onToggle={() => setExpandedDraft(expandedDraft === a.contactId ? null : a.contactId)}
                onSkip={() => setDismissed((prev) => {
                  const next = new Set(prev).add(a.contactId);
                  try { localStorage.setItem("suby_dismissed_alerts", JSON.stringify([...next])); } catch {}
                  return next;
                })} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TodayCallRow({ event }: { event: CalendarEventApi }) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const channel = (event.channel ?? "meet") as CallChannel;
  const meta = CHANNEL_META[channel] ?? CHANNEL_META.meet;
  const isLink = event.location && /^https?:\/\//.test(event.location);
  return (
    <a href={isLink ? event.location : "/dashboard/prep"} target={isLink ? "_blank" : undefined} rel={isLink ? "noopener noreferrer" : undefined}
      style={{ borderLeftWidth: "3px", borderLeftColor: meta.color }}
      className="flex items-center gap-3.5 p-3 px-3.5 bg-card border border-border rounded-lg group transition hover:shadow-soft hover:-translate-y-px"
    >
      <div className="flex flex-col items-center min-w-14">
        <span className="font-mono text-sm font-semibold text-foreground tabular-nums">{fmtTime(start)}</span>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{fmtTime(end)}</span>
      </div>
      <div className="w-px self-stretch bg-border" />
      <div className="size-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold shrink-0">
        {initials(event.contactName || event.title)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-foreground">{event.contactName || event.title}</div>
        <div className="text-xs text-muted-foreground mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">{event.title}</div>
      </div>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0" style={{ background: meta.bg, color: meta.color }}>
        <span>{meta.icon}</span>{meta.label}
      </span>
      <span className="text-[13px] text-muted-foreground shrink-0">→</span>
    </a>
  );
}

function ReachOutRow({ alert, last, expanded, onToggle, onSkip }: {
  alert: AlertApi; last: boolean; expanded: boolean; onToggle: () => void; onSkip: () => void;
}) {
  const u = URGENCY_COLOR[alert.urgency] ?? URGENCY_COLOR.low;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(alert.draftMessage).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <div className={cn("border-b border-border", last && "border-0")}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-3 px-3.5 bg-transparent border-0 cursor-pointer text-left hover:bg-muted transition-colors">
        <span className="size-1.5 rounded-full shrink-0" style={{ background: u.color }} />
        <div className="size-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[11px] font-bold shrink-0">
          {initials(alert.contactName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-foreground">{alert.contactName}</div>
          <div className="text-[11px] mt-0.5 font-medium" style={{ color: u.color }}>{alert.reason}</div>
        </div>
        {alert.channel && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted border border-border text-[10px] shrink-0">
            <PlatformIcon type={alert.channel as PlatformType} size={11} />
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{alert.channelHandle}</span>
          </span>
        )}
        <span className="text-[11px] text-muted-foreground shrink-0">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <div className="pl-[50px] pr-3.5 pb-3.5">
          <div className="p-3 bg-muted border border-border rounded-lg text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
            {alert.draftMessage}
          </div>
          <div className="flex gap-2 mt-2 items-center">
            <Button size="sm" onClick={(e) => { e.stopPropagation(); copy(); }}>{copied ? "Copied ✓" : "Copy"}</Button>
            <div className="flex-1" />
            <button onClick={(e) => { e.stopPropagation(); onSkip(); }} className="bg-transparent border-0 text-muted-foreground text-[11px] cursor-pointer p-1 px-2 hover:text-foreground transition-colors">Skip</button>
          </div>
        </div>
      )}
    </div>
  );
}

function OutcomeRow({ event, isLast, onPick }: { event: CalendarEventApi; isLast: boolean; onPick: (o: string) => void }) {
  const ago = Math.round((Date.now() - new Date(event.start).getTime()) / 3600000);
  const agoLabel = ago < 24 ? `${ago}h ago` : `${Math.round(ago / 24)}d ago`;
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center gap-3 p-3 px-4", !isLast && "border-b border-border")}>
      <div className="size-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[11px] font-bold shrink-0 max-sm:hidden">
        {initials(event.contactName || event.title)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-foreground">{event.contactName || event.title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{event.title} · {agoLabel}</div>
      </div>
      <div className="flex gap-1.5 shrink-0 flex-wrap">
        {OUTCOME_OPTIONS.map((o) => (
          <button key={o.value} onClick={() => onPick(o.value)}
            className="inline-flex items-center gap-1.5 p-1 px-2.5 rounded-lg border border-border text-[11px] font-semibold cursor-pointer whitespace-nowrap transition hover:-translate-y-px"
            style={{ background: o.bg, color: o.color }}
          >
            {o.label}
          </button>
        ))}
        <button onClick={() => onPick("dismissed")} className="bg-transparent border-0 text-muted-foreground cursor-pointer p-1 text-[13px] hover:text-foreground transition-colors">×</button>
      </div>
    </div>
  );
}

function DailyBriefCard({ todayEvents, overdueCount, topAlert, firstName }: {
  todayEvents: CalendarEventApi[]; overdueCount: number; topAlert: AlertApi | null; firstName: string;
}) {
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(34, 158, 217, 0.08) 0%, var(--sf) 60%)" }}>
      <div className="p-2.5 px-3.5 border-b border-border flex items-center gap-2 bg-muted">
        <span className="inline-flex items-center justify-center size-5.5 rounded-full bg-status-blue-bg">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#229ED9">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.74 3.99-1.74 6.65-2.89 7.99-3.44 3.8-1.58 4.59-1.86 5.1-1.87.11 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 .38z" />
          </svg>
        </span>
        <span className="text-xs font-semibold text-foreground">@subyassistant_bot</span>
        <span className="text-[11px] text-muted-foreground">· Daily brief · 8:00</span>
        <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Telegram push</span>
      </div>
      <div className="p-4 text-[13px] text-foreground leading-relaxed">
        <div className="font-semibold mb-1.5">Good morning {firstName}, {dateLabel}</div>

        <div className="mt-2">
          <strong className="inline-flex items-center gap-1.5 font-semibold text-foreground">
            <BriefIcon path="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18" color="#229ED9" />
            Today
          </strong>
          {todayEvents.length === 0 ? (
            <div className="text-xs text-muted-foreground ml-5">No calls scheduled.</div>
          ) : (
            <ul className="mt-1 ml-5 p-0 list-none">
              {todayEvents.slice(0, 3).map((e) => {
                const t = new Date(e.start);
                return (
                  <li key={e.id} className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono text-xs text-foreground font-semibold tabular-nums">
                      {t.getHours().toString().padStart(2, "0")}:{t.getMinutes().toString().padStart(2, "0")}
                    </span>{" "}· {e.contactName || e.title} ({(e.channel ?? "meet").replace("_", " ")})
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {topAlert && (
          <div className="mt-2">
            <strong className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <BriefIcon path="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10z M12 18a6 6 0 1 0-6-6 6 6 0 0 0 6 6z M12 14a2 2 0 1 0-2-2 2 2 0 0 0 2 2z" color="var(--oc)" />
              Top reach-out today
            </strong>
            <div className="text-xs text-muted-foreground ml-5">
              {topAlert.contactName} · {topAlert.reason.toLowerCase()}
            </div>
          </div>
        )}

        {overdueCount > 0 && (
          <div className="mt-2">
            <strong className="inline-flex items-center gap-1.5 font-semibold text-status-red">
              <BriefIcon path="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01" color="var(--rc)" />
              {overdueCount} reminder{overdueCount > 1 ? "s" : ""} overdue
            </strong>
          </div>
        )}

        <div className="mt-3 pt-2.5 border-t border-dashed border-border text-[11px] text-muted-foreground">
          Send a voice note to reply · <span className="font-mono text-xs text-foreground font-semibold tabular-nums">@subyassistant_bot</span>
        </div>
      </div>
    </div>
  );
}
