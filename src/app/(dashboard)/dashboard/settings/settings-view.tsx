"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { calendarApi, gmailApi, xApi, linkedinApi, telegramBotApi, beeperApi } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { ImportView } from "../import/import-view";

type Status = "connected" | "disconnected" | "error";

interface IntegrationDef {
  key: string;
  name: string;
  description: string;
  color: string;
  bg: string;
  iconPath: string;
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    key: "subyassist_bot",
    name: "@subyassistant_bot", // display name; actual username loaded dynamically
    description: "Telegram voice bot. Send voice notes → Whisper transcribes → GPT creates notes/reminders/strength bumps on matching contacts.",
    color: "#229ED9", bg: "#229ED915",
    iconPath: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.74 3.99-1.74 6.65-2.89 7.99-3.44 3.8-1.58 4.59-1.86 5.1-1.87.11 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 .38z",
  },
  {
    key: "google_calendar",
    name: "Google Calendar",
    description: "Sync your calendar to pre-call view. Detects upcoming meetings and links them to contacts.",
    color: "#4285F4", bg: "#4285F415",
    iconPath: "M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z",
  },
  {
    key: "gmail",
    name: "Gmail",
    description: "Index emails from key contacts and surface them in the contact timeline and unified inbox.",
    color: "#EA4335", bg: "#EA433515",
    iconPath: "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z",
  },
  {
    key: "x",
    name: "X / Twitter",
    description: "Paste your auth_token + ct0 cookies from twitter.com to sync DMs into inbox.",
    color: "var(--t1)", bg: "var(--al)",
    iconPath: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    description: "Paste your li_at + JSESSIONID cookies from linkedin.com to sync DMs into inbox.",
    color: "#0A66C2", bg: "#0A66C215",
    iconPath: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  {
    key: "beeper",
    name: "Beeper / Matrix",
    description: "Sync and reply to your LinkedIn, X/Twitter, WhatsApp, and Telegram DMs via Beeper's Matrix Cloud API.",
    color: "#3FBC8C", bg: "#3FBC8C15",
    iconPath: "M.632.55v22.9H2.28V24H0V0h2.28v.55zm7.043 7.26v1.157h.033c.309-.443.683-.784 1.117-1.024.433-.245.936-.365 1.5-.365.54 0 1.033.107 1.488.32.45.214.773.553.96 1.016.293-.39.674-.716 1.14-.98.467-.264.99-.396 1.564-.396.414 0 .8.065 1.157.2.36.13.666.32.92.566.26.245.46.552.604.92.144.366.216.78.216 1.236v6.07h-2.28V11.4c0-.273-.015-.53-.044-.762a1.549 1.549 0 00-.2-.614.994 0 00-.422-.402c-.184-.096-.414-.143-.688-.143-.277 0-.505.057-.683.176a1.18 1.18 0 00-.413.445 1.816 0 00-.2.621 4.457 4.457 0 00-.044.637v5.192h-2.28V11.4c0-.244-.008-.487-.022-.728a1.923 1.923 0 00-.156-.658 1.046 1.046 0 00-.378-.45c-.168-.113-.398-.17-.692-.17a1.53 1.53 0 00-.378.054 1.07 1.07 0 00-.39.204 1.16 1.16 0 00-.307.41c-.08.178-.12.408-.12.69v5.698H5.11V7.81h2.564zm14.842 15.64V.55H21.72V0H24v24h-2.28v-.55z",
  },
];

const STATUS_META: Record<Status, { label: string; bg: string; color: string; dot: string }> = {
  connected: { label: "Connected", bg: "var(--gb)", color: "var(--gc)", dot: "var(--gc)" },
  disconnected: { label: "Not connected", bg: "var(--al)", color: "var(--t3)", dot: "var(--bd2)" },
  error: { label: "Reconnect", bg: "var(--rb)", color: "var(--rc)", dot: "var(--rc)" },
};

const GROUPS = [
  { label: "Voice assistant", keys: ["subyassist_bot"] },
  { label: "Calendar & Email", keys: ["google_calendar", "gmail"] },
  { label: "Messaging", keys: ["beeper"] },
];

// ─── Per-integration connect modals ──────────────────────────────────────────

function XCookieModal({ onConnect, onClose }: {
  onConnect: (d: { authToken: string; ct0: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ authToken: "", ct0: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    if (!form.authToken.trim() || !form.ct0.trim()) { setError("Both cookies are required"); return; }
    setLoading(true); setError("");
    try { await onConnect({ authToken: form.authToken.trim(), ct0: form.ct0.trim() }); onClose(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[420px] rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground">Connect X / Twitter</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Open <strong>twitter.com</strong> → DevTools (F12) → <strong>Application</strong> → Cookies → <strong>twitter.com</strong>. Copy the values for <code>auth_token</code> and <code>ct0</code>:
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">auth_token</label>
              <input value={form.authToken} onChange={set("authToken")} placeholder="Paste auth_token cookie value" className="w-full px-3.5 py-2 text-sm rounded-xl border border-border bg-muted/30 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/60 font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ct0</label>
              <input value={form.ct0} onChange={set("ct0")} placeholder="Paste ct0 cookie value" className="w-full px-3.5 py-2 text-sm rounded-xl border border-border bg-muted/30 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/60 font-mono" />
            </div>
          </div>
          {error && <p className="text-status-red text-xs mt-1 bg-status-red/10 px-3 py-1.5 rounded-lg font-medium">{error}</p>}
        </div>
        <div className="flex gap-2.5 justify-end mt-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={loading || !form.authToken.trim() || !form.ct0.trim()}>{loading && <Spinner />}{loading ? "Connecting…" : "Connect"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LinkedInCookieModal({ onConnect, onClose }: {
  onConnect: (d: { liAt: string; jsessionId?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ liAt: "", jsessionId: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    if (!form.liAt.trim()) { setError("li_at cookie is required"); return; }
    setLoading(true); setError("");
    try { await onConnect({ liAt: form.liAt.trim(), jsessionId: form.jsessionId.trim() || undefined }); onClose(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[420px] rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground">Connect LinkedIn</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Open <strong>linkedin.com</strong> → DevTools (F12) → <strong>Application</strong> → Cookies → <strong>linkedin.com</strong>. Copy the values for <code>li_at</code> and <code>JSESSIONID</code>:
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">li_at <span className="text-status-red">*</span></label>
              <input value={form.liAt} onChange={set("liAt")} placeholder="Paste li_at cookie value" className="w-full px-3.5 py-2 text-sm rounded-xl border border-border bg-muted/30 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/60 font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">JSESSIONID <span className="text-xs text-muted-foreground/60">(optional but recommended)</span></label>
              <input value={form.jsessionId} onChange={set("jsessionId")} placeholder="Paste JSESSIONID cookie value" className="w-full px-3.5 py-2 text-sm rounded-xl border border-border bg-muted/30 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/60 font-mono" />
            </div>
          </div>
          {error && <p className="text-status-red text-xs mt-1 bg-status-red/10 px-3 py-1.5 rounded-lg font-medium">{error}</p>}
        </div>
        <div className="flex gap-2.5 justify-end mt-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={loading || !form.liAt.trim()}>{loading && <Spinner />}{loading ? "Connecting…" : "Connect"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BeeperModal({ onConnect, onClose }: {
  onConnect: (d: { matrixId: string; accessToken: string; localToken?: string; localEndpoint?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ matrixId: "", accessToken: "", localToken: "", localEndpoint: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    if (!form.matrixId.trim() || !form.accessToken.trim()) { setError("Matrix ID and Access Token are required"); return; }
    setLoading(true); setError("");
    try {
      await onConnect({
        matrixId: form.matrixId.trim(),
        accessToken: form.accessToken.trim(),
        localToken: form.localToken.trim() || undefined,
        localEndpoint: form.localEndpoint.trim() || undefined,
      });
      onClose();
    }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[420px] rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground">Connect Beeper</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Enter your Beeper Matrix ID and Access Token to sync LinkedIn, X/Twitter, WhatsApp, and Telegram DMs.
            <br />
            <br />
            To find your token: Open <strong>Beeper Desktop</strong> → <strong>Settings</strong> (Gear icon) → <strong>Help & Support</strong> → scroll to <strong>Active Sessions</strong> → copy the <strong>access token</strong> of the current session.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Beeper Matrix ID <span className="text-status-red">*</span></label>
              <input value={form.matrixId} onChange={set("matrixId")} placeholder="@username:beeper.com" className="w-full px-3.5 py-2 text-sm rounded-xl border border-border bg-muted/30 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/60 font-mono" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Matrix Access Token <span className="text-status-red">*</span></label>
              <input value={form.accessToken} onChange={set("accessToken")} type="password" placeholder="Paste access token value" className="w-full px-3.5 py-2 text-sm rounded-xl border border-border bg-muted/30 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/60 font-mono" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Local Desktop API Token <span className="text-xs text-muted-foreground/60">(Optional, required for sending LinkedIn/X messages)</span></label>
              <input value={form.localToken} onChange={set("localToken")} placeholder="bdapi_..." className="w-full px-3.5 py-2 text-sm rounded-xl border border-border bg-muted/30 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/60 font-mono" />
              <span className="text-[10px] text-muted-foreground/75 mt-1 block leading-normal">
                Open Beeper Desktop → Settings → Integrations → Approved connections → click "+".
              </span>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Beeper Local Endpoint <span className="text-xs text-muted-foreground/60">(Optional — only if Beeper runs on a different machine)</span></label>
              <input value={form.localEndpoint} onChange={set("localEndpoint")} placeholder="https://abc123.ngrok.io" className="w-full px-3.5 py-2 text-sm rounded-xl border border-border bg-muted/30 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/60 font-mono" />
              <span className="text-[10px] text-muted-foreground/75 mt-1 block leading-normal">
                Leave blank if Beeper is running on the same server. Otherwise run <code className="bg-muted px-1 rounded">ngrok http 23373</code> on your machine and paste the URL here.
              </span>
            </div>
          </div>
          {error && <p className="text-status-red text-xs mt-1 bg-status-red/10 px-3 py-1.5 rounded-lg font-medium">{error}</p>}
        </div>
        <div className="flex gap-2.5 justify-end mt-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={loading || !form.matrixId.trim() || !form.accessToken.trim()}>{loading && <Spinner />}{loading ? "Connecting…" : "Connect"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Persist statuses in localStorage to avoid flicker on re-visit ───────────
// Cache is scoped to userId so a new/different user always starts with a clean slate.

type CachedStatuses = {
  gcal?: { connected: boolean; lastSync: string | null };
  gmail?: { connected: boolean; lastSync: string | null };
  xStatus?: { connected: boolean; lastSync: string | null; screenName?: string; hasEnvCreds?: boolean };
  linkedin?: { connected: boolean; profileName: string | null; hasCookie?: boolean; lastSync?: string | null };
  beeper?: { connected: boolean; matrixId: string | null; lastSync: string | null };
};

function cacheKey(userId: string | undefined) {
  return `suby_integration_status_v2_${userId ?? "anon"}`;
}

function readCache(userId: string | undefined): CachedStatuses {
  try { return JSON.parse(localStorage.getItem(cacheKey(userId)) ?? "{}"); } catch { return {}; }
}

function writeCache(userId: string | undefined, s: CachedStatuses) {
  try { localStorage.setItem(cacheKey(userId), JSON.stringify(s)); } catch {}
}

// ─── Main settings view ───────────────────────────────────────────────────────

export function SettingsView() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  const [activeTab, setActiveTab] = useState<"settings" | "import">("settings");
  const [pending, setPending] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  // All null on SSR — populated from localStorage on first client effect (before reload)
  const [gcal, setGcal] = useState<{ connected: boolean; lastSync: string | null } | null>(null);
  const [gmail, setGmail] = useState<{ connected: boolean; lastSync: string | null } | null>(null);
  const [xStatus, setXStatus] = useState<{ connected: boolean; lastSync: string | null; screenName?: string; hasEnvCreds?: boolean } | null>(null);
  const [linkedin, setLinkedin] = useState<{ connected: boolean; profileName: string | null; hasCookie?: boolean; lastSync?: string | null } | null>(null);
  const [beeper, setBeeper] = useState<{ connected: boolean; matrixId: string | null; lastSync: string | null } | null>(null);
  const [botLink, setBotLink] = useState<{ linked: boolean; chatId: string | null; linkedAt: string | null } | null>(null);
  const [botToken, setBotToken] = useState<string | null>(null);
  const [botTokenLoading, setBotTokenLoading] = useState(false);
  const [botPolling, setBotPolling] = useState(false);
  const [botUsername, setBotUsername] = useState("subyassistant_bot");

  const reload = (uid: string | undefined) => {
    calendarApi.status()
      .then((v) => { setGcal(v); writeCache(uid, { ...readCache(uid), gcal: v }); })
      .catch(() => setGcal((p) => p ?? { connected: false, lastSync: null }));
    gmailApi.status()
      .then((v) => { setGmail(v); writeCache(uid, { ...readCache(uid), gmail: v }); })
      .catch(() => setGmail((p) => p ?? { connected: false, lastSync: null }));
    xApi.status()
      .then((v) => { setXStatus(v); writeCache(uid, { ...readCache(uid), xStatus: v }); })
      .catch(() => setXStatus((p) => p ?? { connected: false, lastSync: null }));
    linkedinApi.status()
      .then((v) => { setLinkedin(v); writeCache(uid, { ...readCache(uid), linkedin: v }); })
      .catch(() => setLinkedin((p) => p ?? { connected: false, profileName: null }));
    beeperApi.status()
      .then((v) => { setBeeper(v); writeCache(uid, { ...readCache(uid), beeper: v }); })
      .catch(() => setBeeper((p) => p ?? { connected: false, matrixId: null, lastSync: null }));
    telegramBotApi.status()
      .then((v) => setBotLink(v))
      .catch(() => setBotLink((p) => p ?? { linked: false, chatId: null, linkedAt: null }));
    telegramBotApi.username()
      .then((v) => setBotUsername(v.username))
      .catch(() => {});
  };

  useEffect(() => {
    if (userId === undefined) return; // wait until session is resolved
    // Restore from this user's cache first — instant, no flicker
    const c = readCache(userId);
    if (c.gcal) setGcal(c.gcal);
    if (c.gmail) setGmail(c.gmail);
    if (c.xStatus) setXStatus(c.xStatus);
    if (c.linkedin) setLinkedin(c.linkedin);
    if (c.beeper) setBeeper(c.beeper);
    // Then fetch real state in background
    reload(userId);
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "import") setActiveTab("import");
    if (params.get("calendar") || params.get("gmail") || params.get("x") || params.get("linkedin") || params.get("beeper")) {
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => reload(userId), 2000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Poll for bot link confirmation after token is generated
  useEffect(() => {
    if (!botToken || botLink?.linked) return;
    setBotPolling(true);
    const interval = setInterval(async () => {
      try {
        const status = await telegramBotApi.status();
        if (status.linked) {
          setBotLink(status);
          setBotToken(null);
          setBotPolling(false);
          clearInterval(interval);
        }
      } catch { /* ignore */ }
    }, 2500);
    const timeout = setTimeout(() => { clearInterval(interval); setBotPolling(false); }, 15 * 60 * 1000);
    return () => { clearInterval(interval); clearTimeout(timeout); setBotPolling(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botToken]);

  const statusFor = (key: string): Status => {
    if (key === "google_calendar") return gcal?.connected ? "connected" : "disconnected";
    if (key === "gmail") return gmail?.connected ? "connected" : "disconnected";
    if (key === "x") return xStatus?.connected ? "connected" : "disconnected";
    if (key === "linkedin") return linkedin?.connected ? "connected" : "disconnected";
    if (key === "beeper") return beeper?.connected ? "connected" : "disconnected";
    if (key === "subyassist_bot") return botLink?.linked ? "connected" : "disconnected";
    return "disconnected";
  };

  const metaFor = (key: string): string | undefined => {
    if (key === "google_calendar") return gcal?.lastSync ? `Last synced ${new Date(gcal.lastSync).toLocaleString()}` : gcal?.connected ? "Just connected" : undefined;
    if (key === "gmail") return gmail?.lastSync ? `Last synced ${new Date(gmail.lastSync).toLocaleString()}` : gmail?.connected ? "Just connected" : undefined;
    if (key === "x") {
      if (xStatus?.screenName && xStatus.screenName !== "connected") return `@${xStatus.screenName}`;
      if (xStatus?.lastSync) return `Last synced ${new Date(xStatus.lastSync).toLocaleString()}`;
      if (xStatus?.connected) return "Syncing…";
      return undefined;
    }
    if (key === "linkedin") {
      if (linkedin?.profileName) return linkedin.profileName;
      if (linkedin?.lastSync) return `Last synced ${new Date(linkedin.lastSync).toLocaleString()}`;
      return undefined;
    }
    if (key === "beeper") {
      if (beeper?.matrixId) return beeper.matrixId;
      if (beeper?.lastSync) return `Last synced ${new Date(beeper.lastSync).toLocaleString()}`;
      return undefined;
    }
    if (key === "subyassist_bot") return botLink?.linked ? `@${botUsername} · linked` : undefined;
    return undefined;
  };

  const syncBeeper = async () => {
    setSyncing("beeper");
    try {
      await beeperApi.sync();
      reload(userId);
      // Show "Started" briefly so user knows it kicked off
      setTimeout(() => setSyncing("beeper-done"), 0);
      setTimeout(() => setSyncing(null), 3000);
    } catch (e: any) {
      toast.error(`Beeper sync failed: ${e.message || "Unknown error"}`);
      setSyncing(null);
    }
  };

  const syncX = async () => {
    setSyncing("x");
    try {
      await xApi.sync();
      reload(userId);
    } catch (e: any) {
      toast.error(`X sync failed: ${e.message || "Unknown error"}`);
    } finally {
      setSyncing(null);
    }
  };

  const syncGmail = async () => {
    setSyncing("gmail");
    try { await gmailApi.sync(); reload(userId); }
    catch (e: any) { toast.error(`Gmail sync failed: ${e.message || "Unknown error"}`); }
    finally { setSyncing(null); }
  };

  const syncLinkedIn = async () => {
    setSyncing("linkedin");
    try { await linkedinApi.sync(); reload(userId); }
    catch (e: any) { toast.error(`LinkedIn sync failed: ${e.message || "Unknown error"}`); }
    finally { setSyncing(null); }
  };

  const toggle = async (key: string) => {
    const s = statusFor(key);

    if (s === "connected") {
      // Disconnect
      setPending(key);
      try {
        if (key === "google_calendar") { await calendarApi.disconnect(); setGcal({ connected: false, lastSync: null }); }
        else if (key === "gmail") { await gmailApi.disconnect(); setGmail({ connected: false, lastSync: null }); }
        else if (key === "x") { await xApi.disconnect(); setXStatus({ connected: false, lastSync: null }); }
        else if (key === "linkedin") { await linkedinApi.disconnect(); setLinkedin({ connected: false, profileName: null, hasCookie: false, lastSync: null }); }
        else if (key === "beeper") { await beeperApi.disconnect(); setBeeper({ connected: false, matrixId: null, lastSync: null }); }
      } catch { /* ignore */ }
      finally { setPending(null); }
      return;
    }

    // Connect — open modal or redirect
    if (key === "google_calendar") {
      setPending(key);
      try { const { url } = await calendarApi.connectUrl(); window.location.href = url; }
      catch { setPending(null); }
    } else if (key === "gmail") {
      setPending(key);
      try { const { url } = await gmailApi.connectUrl(); window.location.href = url; }
      catch { setPending(null); }
    } else if (key === "x") {
      setModal("x");
    } else if (key === "linkedin") {
      setModal("linkedin_cookie");
    } else if (key === "beeper") {
      setModal("beeper");
    }
  };

  const connectedCount = ["google_calendar", "gmail", "x", "linkedin", "subyassist_bot", "beeper"]
    .filter((k) => statusFor(k) === "connected").length;

  const def = Object.fromEntries(INTEGRATIONS.map((i) => [i.key, i]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 920 }}>
      <div>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p style={{ color: "var(--t2)", fontSize: 13, marginTop: 4 }}>{connectedCount} integrations connected</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, padding: 4, background: "var(--al)", borderRadius: 10, border: "1px solid var(--bd)", width: "fit-content" }}>
        {(["settings", "import"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "5px 16px",
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              background: activeTab === tab ? "var(--sf)" : "transparent",
              color: activeTab === tab ? "var(--t1)" : "var(--t3)",
              boxShadow: activeTab === tab ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.12s",
            }}
          >
            {tab === "settings" ? "Integrations" : "Import"}
          </button>
        ))}
      </div>

      {activeTab === "import" && <ImportView />}

      {activeTab === "settings" && <>{GROUPS.map((group) => (
        <section key={group.label}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground" style={{ marginBottom: 12 }}>{group.label}</div>
          <div className="rounded-xl border border-border bg-card shadow-sm" style={{ overflow: "hidden" }}>
            {group.keys.map((k, idx) => {
              const i = def[k];
              if (!i) return null;
              const effectiveStatus = statusFor(k);
              const s = STATUS_META[effectiveStatus];
              const meta = metaFor(k);
              const isLast = idx === group.keys.length - 1;
              const isPending = pending === k;
              const isConnected = effectiveStatus === "connected";
              const isBotOnly = k === "subyassist_bot";

              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderBottom: isLast ? "none" : "1px solid var(--bd)" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: i.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={i.color} aria-hidden>
                      <path d={i.iconPath} />
                    </svg>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)" }}>{i.name}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 999, background: s.bg, color: s.color, fontSize: 10, fontWeight: 600 }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot }} />
                        {s.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2, lineHeight: 1.4 }}>{i.description}</div>
                    {meta && (
                      <span className="font-mono text-xs tabular-nums" style={{ fontSize: 11, marginTop: 4, display: "inline-block", padding: "1px 7px", background: "var(--al)", borderRadius: 4, color: "var(--t2)" }}>
                        {meta}
                      </span>
                    )}
                  </div>

                  {!isBotOnly && (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {k === "gmail" && isConnected && (
                        <Button size="sm" variant="outline" onClick={syncGmail} disabled={syncing === "gmail"} className="min-w-[70px]">
                          {syncing === "gmail" && <Spinner />}{syncing === "gmail" ? "Syncing…" : "Sync"}
                        </Button>
                      )}
                      {k === "x" && isConnected && (
                        <Button size="sm" variant="outline" onClick={syncX} disabled={syncing === "x"} className="min-w-[70px]">
                          {syncing === "x" && <Spinner />}{syncing === "x" ? "Syncing…" : "Sync"}
                        </Button>
                      )}
                      {k === "linkedin" && isConnected && (
                        <Button size="sm" variant="outline" onClick={syncLinkedIn} disabled={syncing === "linkedin"} className="min-w-[70px]">
                          {syncing === "linkedin" && <Spinner />}{syncing === "linkedin" ? "Syncing…" : "Sync"}
                        </Button>
                      )}
                      {k === "beeper" && isConnected && (
                        <Button size="sm" variant={syncing === "beeper-done" ? "default" : "outline"} onClick={syncBeeper} disabled={syncing === "beeper"} className="min-w-[70px]">
                          {syncing === "beeper" && <Spinner />}
                          {syncing === "beeper" ? "Starting…" : syncing === "beeper-done" ? "✓ Syncing" : "Sync"}
                        </Button>
                      )}
                      <Button size="sm" variant={isConnected ? "outline" : "default"} onClick={() => toggle(k)} disabled={isPending} className="min-w-[100px]">
                        {isPending && <Spinner />}{isPending ? (isConnected ? "Disconnecting…" : "Connecting…") : isConnected ? "Disconnect" : "Connect"}
                      </Button>
                    </div>
                  )}
                  {isBotOnly && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                      {botLink?.linked ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, color: "var(--gc)", padding: "4px 10px", background: "var(--gb)", borderRadius: 6 }}>Your account linked</span>
                          <Button size="sm" variant="ghost" onClick={async () => {
                            await telegramBotApi.unlink();
                            setBotLink({ linked: false, chatId: null, linkedAt: null });
                            setBotToken(null);
                          }}>Unlink</Button>
                        </div>
                      ) : (
                        <Button size="sm" onClick={async () => {
                          setBotTokenLoading(true);
                          try { const { token } = await telegramBotApi.generateToken(); setBotToken(token); }
                          finally { setBotTokenLoading(false); }
                        }} disabled={botTokenLoading}>
                          {botTokenLoading ? <><Spinner /> Generating…</> : "Connect your account"}
                        </Button>
                      )}
                      {botToken && !botLink?.linked && (
                        <div style={{ marginTop: 4, padding: "10px 12px", borderRadius: "var(--r)", background: "var(--al)", border: "1px solid var(--bd)", minWidth: 280 }}>
                          {botUsername ? (
                            <a
                              href={`https://t.me/${botUsername}?start=${botToken}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                padding: "8px 14px", borderRadius: "var(--r)", background: "#229ED9",
                                color: "#fff", fontWeight: 600, fontSize: 13, textDecoration: "none",
                              }}
                            >
                              Open Telegram to connect
                            </a>
                          ) : null}
                          <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: "var(--bg)", border: "1px solid var(--bd)" }}>
                            <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 3 }}>Or send this code to the bot manually:</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <code style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", flex: 1 }}>{botToken}</code>
                              <button
                                onClick={() => navigator.clipboard.writeText(botToken)}
                                style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, border: "1px solid var(--bd)", background: "var(--al)", cursor: "pointer", color: "var(--t2)" }}
                              >Copy</button>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                            {botPolling && <Spinner />}
                            <span style={{ fontSize: 10, color: "var(--t3)" }}>
                              {botPolling ? "Waiting for confirmation…" : "Expires in 15 min."}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p style={{ fontSize: 11, color: "var(--t3)", textAlign: "center" }}>Need another integration? Drop a note in <span className="font-mono text-xs tabular-nums">#suby-feedback</span>.</p>
      </> }

      {/* Modals */}
      {modal === "x" && (
        <XCookieModal
          onConnect={async (d) => { await xApi.saveCookie(d); reload(userId); }}
          onClose={() => { setModal(null); reload(userId); }}
        />
      )}
      {modal === "linkedin_cookie" && (
        <LinkedInCookieModal
          onConnect={async (d) => { await linkedinApi.saveCookie(d); reload(userId); }}
          onClose={() => { setModal(null); reload(userId); }}
        />
      )}
      {modal === "beeper" && (
        <BeeperModal
          onConnect={async (d) => { await beeperApi.connect(d); reload(userId); }}
          onClose={() => { setModal(null); reload(userId); }}
        />
      )}
    </div>
  );
}
