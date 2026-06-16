"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { inboxApi, meApi, gmailApi, slackApi, contactsApi, type InboxConversationApi, type InboxMessageApi } from "@/lib/api";
import { PlatformIcon } from "@/components/platform-icon";
import { Star, Archive, ArchiveRestore } from "lucide-react";
import type { PlatformType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { getCached, setCached } from "@/lib/page-cache";

// Sent messages only in local state (not persisted)
function cleanPreview(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, (_, name) => (name?.trim() ? `📷 ${name}` : "📷 Image"))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "📎 $1");
}

interface SentMessage {
  id: string; body: string; sentAt: string; fromMe: true;
  status?: "sending" | "sent" | "delivered" | "failed";
  quotedBody?: string | null;
  quotedFromMe?: boolean | null;
}

type Filter = "all" | "unread" | "archived" | "starred" | "unknown";

function fmtAgo(iso: string): string {
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  if (m < 1) return "now";
  if (m < 60) return `${Math.round(m)}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  if (m < 60 * 24 * 7) return `${Math.round(m / 60 / 24)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("");
}

function formatSenderId(platform: string, senderId: string | null): string {
  if (!senderId) return "Unknown";
  if (platform === "whatsapp") return "+" + senderId.replace(/@.+$/, "");
  if (platform === "email") return senderId;
  return senderId.replace(/^@/, "");
}

function renderMessageBody(text: string, onImageClick?: (url: string) => void) {
  if (!text) return "";
  const regex = /(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s]+)/g;
  const parts = text.split(regex);
  return parts.map((part, i) => {
    if (part.startsWith("![")) {
      const match = part.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (match) {
        const [, alt, url] = match;
        const isVideo = /\.(mp4|mov|avi|mkv|3gp|webm)(\?|$)/i.test(url);
        if (isVideo) {
          return (
            <video
              key={i}
              src={url}
              controls
              style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, marginTop: 6, display: "block" }}
            />
          );
        }
        return (
          <img
            key={i}
            src={url}
            alt={alt || "Image"}
            onClick={() => onImageClick?.(url)}
            style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, marginTop: 6, display: "block", objectFit: "contain",
              cursor: onImageClick ? "zoom-in" : undefined }}
          />
        );
      }
    } else if (part.startsWith("[")) {
      const match = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (match) {
        const [, label, url] = match;
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3b82f6", textDecoration: "underline", wordBreak: "break-all" }}
          >
            {label}
          </a>
        );
      }
    } else if (part.startsWith("http://") || part.startsWith("https://")) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#3b82f6", textDecoration: "underline", wordBreak: "break-all" }}
        >
          {part}
        </a>
      );
    }
    return <span key={i} style={{ whiteSpace: "pre-wrap" }}>{part}</span>;
  });
}

export function InboxView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkContactId = searchParams.get("contactId");
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastScrolledKeyRef = useRef<string | null>(null);
  const threadLoadingRef = useRef(false);
  // In-memory thread cache — keyed by conv.key, survives within the session
  const threadCacheRef = useRef<Map<string, { msgs: InboxMessageApi[]; at: number }>>(new Map());
  const THREAD_TTL = 60_000; // re-fetch after 60s of not being viewed

  const cached = getCached<InboxConversationApi[]>("inbox:conversations");
  const [conversations, setConversations] = useState<InboxConversationApi[]>(cached ?? []);
  const [thread, setThread] = useState<InboxMessageApi[]>([]);
  const [sentMessages, setSentMessages] = useState<Record<string, SentMessage[]>>({});
  const [selected, setSelected] = useState<InboxConversationApi | null>(null);
  const [loading, setLoading] = useState(!cached);
  const [threadLoading, setThreadLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  // Uncontrolled textarea — no React state on keystrokes, eliminates typing lag
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sendError, setSendError] = useState("");
  const [me, setMe] = useState<{ name: string | null; email: string | null }>({ name: null, email: null });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<InboxMessageApi | null>(null);
  const [reactionPickerId, setReactionPickerId] = useState<string | null>(null);
  const [localReactions, setLocalReactions] = useState<Record<string, string>>({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [typingContactIds, setTypingContactIds] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMoreMessages, setNoMoreMessages] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRestoreRef = useRef<number | null>(null); // scrollHeight before prepend
  const isLoadingMoreRef = useRef(false);
  const [addToContactsFor, setAddToContactsFor] = useState<InboxConversationApi | null>(null);
  const [addToContactsName, setAddToContactsName] = useState("");
  const [addToContactsSaving, setAddToContactsSaving] = useState(false);
  const [addToContactsError, setAddToContactsError] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<{
    previewUrl: string; markdownTag: string; name: string; isImage: boolean;
    uploading?: boolean; uploadProgress?: number; blobUrl?: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InboxMessageApi[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const REACTIONS = ["👍", "❤️", "😂", "🙏", "😮", "😢"];
  const EMOJI_LIST = [
    "😀","😂","😊","😍","😎","🥹","😅","😭","🤔","🙄",
    "👍","👎","❤️","🔥","🙏","💯","🎉","👀","💪","✨",
    "😱","🤣","😤","🥳","😴","💀","🤯","😇","🤗","🫡",
  ];

  // Formats browsers can actually render inline — everything else becomes a download link
  const RENDERABLE_IMAGE = new Set([
    "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/avif",
  ]);

  const BLOCKED_TYPES = new Set(["image/heic", "image/heif", "image/tiff", "image/bmp"]);

  const uploadFile = async (file: File) => {
    if (BLOCKED_TYPES.has(file.type) || /\.(heic|heif|tiff?|bmp)$/i.test(file.name)) {
      setSendError("HEIC/TIFF/BMP files can't be sent — convert to JPG or PNG first.");
      return;
    }
    const isImage = RENDERABLE_IMAGE.has(file.type) || file.type.startsWith("video/");
    // Show preview immediately — no server roundtrip needed for display
    const blobUrl = URL.createObjectURL(file);
    setPendingAttachment({ previewUrl: blobUrl, markdownTag: "", name: file.name, isImage, uploading: true, uploadProgress: 0, blobUrl });
    setUploading(true);
    setSendError("");

    await new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const fileData = event.target?.result as string;
        if (!fileData) { setSendError("Failed to read file"); setUploading(false); setPendingAttachment(null); URL.revokeObjectURL(blobUrl); resolve(); return; }
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/inbox/upload");
        xhr.withCredentials = true;
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setPendingAttachment((prev) => prev ? { ...prev, uploadProgress: Math.round(e.loaded / e.total * 100) } : prev);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText) as { url: string };
              const markdownTag = isImage ? `![${file.name}](${res.url})` : `[${file.name}](${res.url})`;
              setPendingAttachment({ previewUrl: blobUrl, markdownTag, name: file.name, isImage, uploading: false, uploadProgress: 100, blobUrl });
            } catch { setSendError("Invalid upload response"); setPendingAttachment(null); URL.revokeObjectURL(blobUrl); }
          } else {
            try { setSendError(JSON.parse(xhr.responseText).error || `Upload failed (${xhr.status})`); }
            catch { setSendError(`Upload failed (${xhr.status})`); }
            setPendingAttachment(null);
            URL.revokeObjectURL(blobUrl);
          }
          setUploading(false);
          resolve();
        };
        xhr.onerror = () => { setSendError("Upload failed — check your connection"); setUploading(false); setPendingAttachment(null); URL.revokeObjectURL(blobUrl); resolve(); };
        xhr.send(JSON.stringify({ filename: file.name, fileData }));
      };
      reader.onerror = () => { setSendError("Failed to read file"); setUploading(false); setPendingAttachment(null); URL.revokeObjectURL(blobUrl); resolve(); };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    await uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!q.trim()) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await inboxApi.search(q.trim());
        setSearchResults(results);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 300);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => RENDERABLE_IMAGE.has(item.type));
    if (!imageItem || !selected) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    // Give it a timestamped name since clipboard items have no filename
    const ext = file.type.split("/")[1] ?? "png";
    const namedFile = new File([file], `image_${Date.now()}.${ext}`, { type: file.type });
    await uploadFile(namedFile);
  };

  useEffect(() => {
    meApi.get().then((u) => setMe(u)).catch(() => {});
  }, []);

  // Slack sync on mount — lightweight. Gmail is handled by the 5-min BullMQ cron; no need to also
  // trigger it here (doing so causes socket hang-up when the sync takes longer than the proxy timeout).
  useEffect(() => {
    slackApi.sync().catch(() => {});
  }, []);

  const [sessionExpired, setSessionExpired] = useState(false);

  // Stable ref so SSE handler can access latest selected without re-subscribing
  const selectedRef = useRef<InboxConversationApi | null>(null);
  selectedRef.current = selected;

  const fetchConvsRef = useRef<(() => Promise<unknown>) | null>(null);

  useEffect(() => {
    const cached = getCached<InboxConversationApi[]>("inbox:conversations");
    let lastConvsSig = "";
    let convRefetchTimer: ReturnType<typeof setTimeout> | null = null;
    // Coalesce bursts of SSE events into one refetch — avoids list churn during syncs
    const scheduleConvRefetch = () => {
      if (convRefetchTimer) return;
      convRefetchTimer = setTimeout(() => {
        convRefetchTimer = null;
        fetchConvsRef.current?.();
      }, 1500);
    };

    const fetchConvs = async () => {
      try {
        const convs = await inboxApi.getConversations();
        // Identical payload → skip the state update entirely so the list doesn't re-render
        const sig = JSON.stringify(convs);
        if (sig === lastConvsSig) { setLoading(false); return convs; }
        lastConvsSig = sig;
        setCached("inbox:conversations", convs);
        // Always show the currently-open conversation as read — the mark-read DB write
        // may not have finished yet, causing a stale unreadCount to flash back in.
        const sel = selectedRef.current;
        setConversations(sel
          ? convs.map((c) => c.key === sel.key ? { ...c, unreadCount: 0 } : c)
          : convs
        );
        return convs;
      } catch (err: any) {
        const msg = err?.message ?? "";
        if (msg.includes("session") || msg.includes("Unauthorized") || msg.includes("401")) {
          setSessionExpired(true);
        }
        return undefined;
      } finally {
        setLoading(false);
      }
    };
    fetchConvsRef.current = fetchConvs;

    fetchConvs().then(async (convs) => {
      if (deepLinkContactId) {
        const match = convs?.find((c) => c.contactId === deepLinkContactId);
        if (match) { selectConversation(match); return; }
        // Contact has no messages yet — fetch their info and open an empty thread
        try {
          const contact = await contactsApi.getById(deepLinkContactId);
          const firstPlatform = contact?.platforms?.[0];
          if (contact && firstPlatform) {
            const synthetic: InboxConversationApi = {
              key: `${deepLinkContactId}:${firstPlatform.type}`,
              contactId: deepLinkContactId,
              contactName: contact.name,
              platform: firstPlatform.type as any,
              senderId: firstPlatform.platformId,
              latestMessage: null as any,
              unreadCount: 0,
              archived: false,
              messageCount: 0,
              starred: false,
            };
            selectConversation(synthetic);
            return;
          }
        } catch {}
      }
      if (!cached && convs?.length) selectConversation(convs[0]);
    });

    // SSE for real-time push — conversations + active thread refresh on new messages
    const API_BASE = "";
    const es = new EventSource(`${API_BASE}/api/inbox/events`, { withCredentials: true });

    es.addEventListener("new_message", (e) => {
      // Background re-fetch for eventual consistency — coalesced, don't await
      scheduleConvRefetch();

      try {
        const data = JSON.parse((e as MessageEvent).data || "{}");
        const msg = data.message;
        const sel = selectedRef.current;

        if (msg) {
          const isKnownMatch = data.contactId && sel && data.contactId === sel.contactId && data.platform === sel.platform;
          const isUnknownMatch = !data.contactId && sel && !sel.contactId && data.platform === sel.platform && msg.senderId === sel.senderId;
          const isCurrentChat = isKnownMatch || isUnknownMatch;

          // Build the conversation key for this message
          const convKey = msg.contactId
            ? `${msg.contactId}:${msg.platform}`
            : msg.senderId ? `unknown:${msg.senderId}:${msg.platform}` : null;

          // Instantly update the conversation list — no network round trip
          if (convKey) {
            setConversations((prev) => {
              const idx = prev.findIndex((c) => c.key === convKey);
              const isRead = isCurrentChat || !!msg.fromMe;
              if (idx >= 0) {
                const existing = prev[idx];
                // Historical/backfill message (older than what's already shown):
                // don't reorder or bump unread — the next poll places it correctly.
                const isNewer = +new Date(msg.receivedAt) >= +new Date(existing.latestMessage?.receivedAt ?? 0);
                if (!isNewer) return prev;
                const updated = {
                  ...existing,
                  latestMessage: msg,
                  contactName: msg.contactName ?? existing.contactName,
                  unreadCount: isRead ? 0 : existing.unreadCount + 1,
                };
                const next = prev.filter((_, i) => i !== idx);
                return [updated, ...next]; // move to top
              } else if (!msg.fromMe) {
                // Brand new conversation
                const newConv: InboxConversationApi = {
                  key: convKey, contactId: msg.contactId ?? null,
                  contactName: msg.contactName ?? null, platform: msg.platform,
                  senderId: msg.senderId ?? null, latestMessage: msg,
                  unreadCount: isCurrentChat ? 0 : 1, archived: false,
                  messageCount: 1, starred: false,
                };
                return [newConv, ...prev];
              }
              return prev;
            });
            if (isCurrentChat) window.dispatchEvent(new Event("inbox-read"));
          }

          if (isCurrentChat && sel) {
            setThread((prev) => {
              const idx = prev.findIndex((m) => m.id === msg.id);
              let next: typeof prev;
              if (idx >= 0) {
                if (prev[idx].body === msg.body) return prev;
                next = [...prev];
                next[idx] = msg;
              } else {
                next = [...prev, msg];
              }
              threadCacheRef.current.set(sel.key, { msgs: next, at: Date.now() });
              return next;
            });
            if (msg.fromMe) {
              setSentMessages((prev) => {
                const list = prev[sel.key] ?? [];
                const next = list.filter((m) => m.body !== msg.body || m.id === msg.id);
                return next.length === list.length ? prev : { ...prev, [sel.key]: next };
              });
            }
          } else if (sel) {
            const fetchFn = sel.contactId
              ? inboxApi.getThread(sel.contactId, sel.platform)
              : sel.senderId ? inboxApi.getUnknownThread(sel.senderId, sel.platform) : null;
            fetchFn?.then(setThread).catch(() => {});
          }
        }
      } catch {
        const sel = selectedRef.current;
        if (sel) {
          const fetchFn = sel.contactId
            ? inboxApi.getThread(sel.contactId, sel.platform)
            : sel.senderId ? inboxApi.getUnknownThread(sel.senderId, sel.platform) : null;
          fetchFn?.then(setThread).catch(() => {});
        }
      }
    });

    es.addEventListener("message_deleted", (e) => {
      scheduleConvRefetch();
      try {
        const data = JSON.parse((e as MessageEvent).data || "{}");
        if (data.id) {
          // Capture the deleted message's body so the optimistic sent-copy with
          // the same text doesn't resurface once the DB row disappears (the
          // overlay dedups against DB bodies — removing the DB row unhides it).
          let victimBody: string | null = null;
          setThread((prev) => {
            victimBody = prev.find((m) => m.id === data.id)?.body ?? null;
            return prev.filter((m) => m.id !== data.id);
          });
          setTimeout(() => {
            const sel = selectedRef.current;
            if (!sel || victimBody == null) return;
            setSentMessages((p) => {
              const list = p[sel.key] ?? [];
              const next = list.filter((m) => m.body !== victimBody);
              return next.length === list.length ? p : { ...p, [sel.key]: next };
            });
            // Drop the cached thread too so switching away and back doesn't revive it
            threadCacheRef.current.delete(sel.key);
          }, 0);
        } else {
          const sel = selectedRef.current;
          if (sel) {
            const fetchFn = sel.contactId
              ? inboxApi.getThread(sel.contactId, sel.platform)
              : sel.senderId ? inboxApi.getUnknownThread(sel.senderId, sel.platform) : null;
            fetchFn?.then(setThread).catch(() => {});
          }
        }
      } catch {
        const sel = selectedRef.current;
        if (sel) {
          const fetchFn = sel.contactId
            ? inboxApi.getThread(sel.contactId, sel.platform)
            : sel.senderId ? inboxApi.getUnknownThread(sel.senderId, sel.platform) : null;
          fetchFn?.then(setThread).catch(() => {});
        }
      }
    });

    es.addEventListener("conversations_changed", () => {
      scheduleConvRefetch();
    });

    es.addEventListener("typing", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data || "{}");
        if (!data.senderId) return;
        setTypingContactIds((prev) => {
          const next = new Set(prev);
          if (data.typing) next.add(data.senderId); else next.delete(data.senderId);
          return next;
        });
        if (data.typing) {
          setTimeout(() => setTypingContactIds((prev) => { const next = new Set(prev); next.delete(data.senderId); return next; }), 10_000);
        }
      } catch {}
    });

    es.addEventListener("status_update", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data || "{}");
        if (data.externalId && data.waStatus) {
          setThread((prev) => prev.map((m) => (m as any).externalId === data.externalId ? { ...m, waStatus: data.waStatus } : m));
        }
      } catch {}
    });

    es.addEventListener("send_confirmed", (e) => {
      try {
        const data = JSON.parse((e as any).data || "{}");
        console.log("[inbox] send_confirmed received", data);
        if (data.tempId) {
          // Mark the optimistic bubble as delivered if still alive
          setSentMessages((prev) => {
            const updated: typeof prev = {};
            for (const [k, list] of Object.entries(prev)) {
              updated[k] = list.map((m) => m.id === data.tempId ? { ...m, status: "delivered" } : m);
            }
            return updated;
          });
          // Directly patch the DB message in thread state so ✓✓ appears immediately.
          // The DB message's externalId is the tempId (until background task updates it),
          // so we match on both tempId and canonicalId to be safe.
          const ids = new Set([data.tempId, data.canonicalId].filter(Boolean));
          console.log("[inbox] patching thread for ids:", [...ids]);
          setThread((prev) => {
            const threadIds = prev.map((m) => (m as InboxMessageApi).externalId);
            console.log("[inbox] thread externalIds:", threadIds, "looking for:", [...ids]);
            let changed = false;
            const next = prev.map((m) => {
              if (ids.has((m as InboxMessageApi).externalId)) {
                changed = true;
                return { ...m, waStatus: "delivered" } as InboxMessageApi;
              }
              return m;
            });
            console.log("[inbox] thread patch changed:", changed);
            return changed ? next : prev;
          });
        }
      } catch (err) { console.error("[inbox] send_confirmed error:", err); }
    });

    es.addEventListener("send_failed", (e) => {
      try {
        const data = JSON.parse((e as any).data || "{}");
        // Mark the optimistic message bubble as failed regardless of which chat is open
        if (data.tempId) {
          setSentMessages((prev) => {
            const updated: typeof prev = {};
            for (const [k, list] of Object.entries(prev)) {
              updated[k] = list.map((m) => m.id === data.tempId ? { ...m, status: "failed" } : m);
            }
            return updated;
          });
        }
        // Show error text only if this chat is currently open
        if (selectedRef.current?.contactId === data.contactId) {
          const raw = data.error ?? "";
          const clean = !raw || (raw.length > 120 && !raw.includes("Beeper") && !raw.includes("Settings"))
            ? "Message not sent — please try again"
            : raw;
          setSendError(clean);
        }
      } catch {}
    });

    es.addEventListener("open", () => {
      const sel = selectedRef.current;
      if (sel) {
        const fetchFn = sel.contactId
          ? inboxApi.getThread(sel.contactId, sel.platform)
          : sel.senderId ? inboxApi.getUnknownThread(sel.senderId, sel.platform) : null;
        fetchFn?.then(setThread).catch(() => {});
      }
    });

    // Fallback polling every 5s — SSE handles real-time, this catches any gaps
    const iv = setInterval(fetchConvs, 5_000);

    return () => {
      es.close();
      clearInterval(iv);
      if (convRefetchTimer) clearTimeout(convRefetchTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore scroll position after prepending older messages.
  // Does NOT clear isLoadingMoreRef — useEffect below does that after guarding.
  useLayoutEffect(() => {
    if (loadMoreRestoreRef.current !== null && scrollContainerRef.current) {
      const newScrollHeight = scrollContainerRef.current.scrollHeight;
      scrollContainerRef.current.scrollTop = newScrollHeight - loadMoreRestoreRef.current;
      loadMoreRestoreRef.current = null;
    }
  }, [thread]);

  // Scroll to bottom when new messages arrive
  const prevBottomIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selected) return;
    const bottomId = thread[thread.length - 1]?.id ?? null;
    const bottomChanged = bottomId !== prevBottomIdRef.current;
    prevBottomIdRef.current = bottomId;

    if (isLoadingMoreRef.current) {
      isLoadingMoreRef.current = false; // clear here, after guarding, so useLayoutEffect above runs first
      return;
    }

    const isNewConversation = lastScrolledKeyRef.current !== selected.key;
    const loading = threadLoadingRef.current;

    if (isNewConversation || loading) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
      if (!loading) {
        lastScrolledKeyRef.current = selected.key;
      }
    } else if (bottomChanged) {
      // Only follow to the bottom when a genuinely new message landed there.
      // Length changes alone (older pages merged in, mid-thread deletions)
      // must not yank the user away from where they scrolled.
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [thread.length, thread[thread.length - 1]?.id, selected]);

  // Safety-net polling: catches any messages missed during SSE gaps + keeps cache warm
  useEffect(() => {
    if (!selected) return;
    const key = selected.key;
    const iv = setInterval(() => {
      const fetchFn = selected.contactId
        ? inboxApi.getThread(selected.contactId, selected.platform)
        : selected.senderId
          ? inboxApi.getUnknownThread(selected.senderId, selected.platform)
          : null;
      fetchFn
        ?.then((msgs) => {
          // Guard: discard if user has already switched away
          if (selectedRef.current?.key !== key) return;
          setThread((prev) => {
            if (msgs.length >= prev.length) return msgs;
            // Shorter list, two possible reasons:
            // 1. The user loaded older pages — the poll only returns the latest
            //    window, so merge: keep loaded history older than the window and
            //    let the window itself be server truth (reflects deletions).
            // 2. A deletion — covered by the same merge.
            // Reject outright only stale snapshots missing the newest message.
            const prevLastId = prev[prev.length - 1]?.id;
            if (!prevLastId || !msgs.some((m) => m.id === prevLastId)) return prev;
            const windowStart = +new Date(msgs[0]?.receivedAt ?? 0);
            const olderPages = prev.filter((m) => +new Date(m.receivedAt) < windowStart && !msgs.some((s) => s.id === m.id));
            return olderPages.length > 0 ? [...olderPages, ...msgs] : msgs;
          });
          threadCacheRef.current.set(key, { msgs, at: Date.now() });
        })
        .catch(() => {});
    }, 5_000);
    return () => clearInterval(iv);
  }, [selected]);


  const selectConversation = (conv: InboxConversationApi) => {
    setSelected(conv);
    if (textareaRef.current) textareaRef.current.value = "";
    setSendError("");
    setReplyingTo(null);
    setPendingAttachment(null);
    setNoMoreMessages(false);
    isLoadingMoreRef.current = false;

    // Show cached thread instantly if it's fresh enough
    const cached = threadCacheRef.current.get(conv.key);
    const isFresh = cached && Date.now() - cached.at < THREAD_TTL;
    if (isFresh) {
      setThread(cached.msgs);
      threadLoadingRef.current = false;
      setThreadLoading(false);
    } else {
      setThread(conv.latestMessage ? [conv.latestMessage] : []);
      threadLoadingRef.current = true;
      setThreadLoading(true);
    }

    const threadPromise = conv.contactId
      ? inboxApi.getThread(conv.contactId, conv.platform)
      : conv.senderId
        ? inboxApi.getUnknownThread(conv.senderId, conv.platform)
        : Promise.resolve(conv.latestMessage ? [conv.latestMessage] : []);

    threadPromise
      .then((res) => {
        const fresh = res.length > 0 ? res : (conv.latestMessage ? [conv.latestMessage] : []);
        threadCacheRef.current.set(conv.key, { msgs: fresh, at: Date.now() });
        if (selectedRef.current?.key === conv.key) {
          setThread(fresh);
        }
      })
      .catch(() => {
        if (selectedRef.current?.key === conv.key) setThread(conv.latestMessage ? [conv.latestMessage] : []);
      })
      .finally(() => {
        if (selectedRef.current?.key === conv.key) {
          threadLoadingRef.current = false;
          setThreadLoading(false);
        }
      });

    // Mark all messages in this conversation as read + send WA read receipts + subscribe to presence
    if (conv.contactId) {
      inboxApi.markConversationRead(conv.contactId, conv.platform).catch(() => {});
    } else if (conv.senderId) {
      inboxApi.markUnknownConversationRead(conv.senderId, conv.platform).catch(() => {});
    }
    if (conv.platform === "whatsapp" && conv.senderId) {
      inboxApi.subscribePresence(conv.senderId).catch(() => {});
    }
    setConversations((prev) => prev.map((c) =>
      c.key === conv.key ? { ...c, unreadCount: 0, latestMessage: { ...c.latestMessage, read: true } } : c
    ));
    window.dispatchEvent(new Event("inbox-read"));
  };

  const filtered = conversations.filter((c) => {
    if (platformFilter !== "all" && c.platform !== platformFilter) return false;
    if (filter === "archived") return c.archived;
    if (c.archived) return false; // hide archived from all other tabs
    if (filter === "unread") return c.unreadCount > 0;
    if (filter === "starred") return c.starred;
    if (filter === "unknown") return !c.contactId;
    return true;
  });

  // Platforms that actually have conversations — drive the filter chips
  const activePlatforms = Array.from(
    conversations.reduce((map, c) => {
      map.set(c.platform, (map.get(c.platform) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1]);

  const totalUnread = conversations.filter((c) => !c.archived).reduce((s, c) => s + c.unreadCount, 0);
  const totalArchived = conversations.filter((c) => c.archived).length;
  const totalStarred = conversations.filter((c) => c.starred && !c.archived).length;
  const totalUnknown = conversations.filter((c) => !c.contactId && !c.archived).length;

  const handleSend = () => {
    const textBody = textareaRef.current?.value.trim() ?? "";
    const attachment = pendingAttachment;
    const body = attachment
      ? textBody ? `${textBody}\n\n${attachment.markdownTag}` : attachment.markdownTag
      : textBody;
    if (!body || !selected) return;

    const lastMsg = thread[thread.length - 1] ?? selected.latestMessage ?? null;
    const msgIdForReply = lastMsg?.id ?? "new";
    const tempId = `sent-${Date.now()}`;
    const replyToId = replyingTo?.id;

    // Clear input and attachment immediately — feels instant
    if (textareaRef.current) textareaRef.current.value = "";
    setPendingAttachment(null);
    setReplyingTo(null);
    setSendError("");

    // Show as sent immediately — no spinner
    const outgoing: SentMessage = {
      id: tempId, body, sentAt: new Date().toISOString(), fromMe: true, status: "sent",
      quotedBody: replyingTo?.body ?? replyingTo?.preview ?? null,
      quotedFromMe: replyingTo ? !!replyingTo.fromMe : null,
    };
    setSentMessages((prev) => ({ ...prev, [selected.key]: [...(prev[selected.key] ?? []), outgoing] }));

    // Fire and forget — only revert to ⚠️ if it actually fails
    const ctx = { contactId: selected.contactId, platform: selected.platform, senderId: selected.senderId };
    inboxApi.reply(msgIdForReply, body, replyToId, ctx, tempId).catch((e: unknown) => {
      setSentMessages((prev) => {
        const list = prev[selected.key] ?? [];
        return { ...prev, [selected.key]: list.map((m) => m.id === tempId ? { ...m, status: "failed" } : m) };
      });
      const raw = e instanceof Error ? e.message : "";
      const friendly = !raw || raw.startsWith("API error") || (raw.length > 120 && !raw.includes("Settings") && !raw.includes("Beeper"))
        ? "Message failed to deliver — please try again"
        : raw;
      setSendError(friendly);
    });
  };

  const handleArchive = async (conv: InboxConversationApi) => {
    const isArchived = conv.archived;
    // Optimistic update
    setConversations((prev) => prev.map((c) => c.key === conv.key ? { ...c, archived: !isArchived } : c));
    if (selected?.key === conv.key && !isArchived) {
      // Move to next non-archived conversation, or clear
      const remaining = conversations.filter((c) => c.key !== conv.key && !c.archived);
      setSelected(remaining[0] ?? null);
    }
    try {
      if (isArchived) {
        await inboxApi.unarchiveConversation(conv.contactId, conv.senderId, conv.platform);
      } else {
        await inboxApi.archiveConversation(conv.contactId, conv.senderId, conv.platform);
      }
    } catch {
      // Revert on failure
      setConversations((prev) => prev.map((c) => c.key === conv.key ? { ...c, archived: isArchived } : c));
    }
  };

  const handleDeleteMsg = (msgId: string) => {
    setThread((prev) => prev.filter((m) => m.id !== msgId));
    setSentMessages((prev) => {
      if (!selected) return prev;
      return { ...prev, [selected.key]: (prev[selected.key] ?? []).filter((m) => m.id !== msgId) };
    });
    inboxApi.delete(msgId).catch(() => {});
  };

const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + emoji + el.value.slice(end);
    el.selectionStart = el.selectionEnd = start + emoji.length;
    el.focus();
    setShowEmojiPicker(false);
  };

  const handleAddToContacts = async () => {
    if (!addToContactsFor || !addToContactsName.trim()) return;
    setAddToContactsSaving(true);
    setAddToContactsError("");
    try {
      const contact = await contactsApi.create({ name: addToContactsName.trim() } as any);
      if (addToContactsFor.senderId) {
        await contactsApi.addPlatform(contact.id, {
          type: addToContactsFor.platform,
          platformId: addToContactsFor.senderId,
          displayName: addToContactsFor.contactName ?? undefined,
        });
      }
      setAddToContactsFor(null);
      setAddToContactsName("");
      await fetchConvsRef.current?.();
    } catch (err: any) {
      setAddToContactsError(err?.message ?? "Failed to save contact");
    } finally {
      setAddToContactsSaving(false);
    }
  };

  const PLATFORM_LABEL: Record<string, string> = {
    telegram: "Telegram", email: "Email", x: "X", linkedin: "LinkedIn",
    discord: "Discord", slack: "Slack", whatsapp: "WhatsApp",
  };

  const PLATFORM_COLOR: Record<string, string> = {
    whatsapp: "#25D366", telegram: "#229ED9", slack: "#E01E5A",
    discord: "#5865F2", linkedin: "#0A66C2", email: "#6b7280", x: "#888",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "calc(100vh - 80px)" }}>
      {/* Lightbox */}
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.88)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
          <img src={lightboxUrl} alt="Full size"
            style={{ maxWidth: "92vw", maxHeight: "92vh", borderRadius: 10, objectFit: "contain", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }} />
          <button onClick={() => setLightboxUrl(null)}
            style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)",
              border: "none", color: "#fff", fontSize: 20, width: 36, height: 36, borderRadius: "50%",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
      )}
      {/* Add to Contacts modal */}
      {addToContactsFor && (
        <div onClick={() => setAddToContactsFor(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: 16, padding: "24px",
              width: 360, boxShadow: "0 12px 48px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)",
              display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--t1)", margin: 0 }}>Add to Contacts</h3>
              <button onClick={() => setAddToContactsFor(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)",
                  fontSize: 20, lineHeight: 1, padding: "2px 6px", borderRadius: 6 }}>×</button>
            </div>
            {/* Platform identity row */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
              background: "var(--bg)", border: "1px solid var(--bd)", borderRadius: 10 }}>
              <PlatformIcon type={addToContactsFor.platform as PlatformType} size={20} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "var(--t2)", textTransform: "capitalize",
                  fontWeight: 600, letterSpacing: "0.03em" }}>
                  {addToContactsFor.platform}
                </div>
                <div style={{ fontSize: 13, color: "var(--t1)", fontWeight: 500, marginTop: 2 }}>
                  {formatSenderId(addToContactsFor.platform, addToContactsFor.senderId)}
                </div>
              </div>
            </div>
            {/* Name input */}
            <div>
              <label style={{ fontSize: 12, color: "var(--t2)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                Contact name
              </label>
              <input
                value={addToContactsName}
                onChange={(e) => setAddToContactsName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !addToContactsSaving) handleAddToContacts(); }}
                placeholder="Enter a name…"
                autoFocus
                style={{ width: "100%", padding: "9px 12px", fontSize: 14, borderRadius: 8,
                  border: "1.5px solid var(--bd2)", background: "var(--sf)", color: "var(--t1)",
                  outline: "none", boxSizing: "border-box" }}
                onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "var(--t1)"; }}
                onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "var(--bd2)"; }}
              />
            </div>
            {addToContactsError && (
              <p style={{ fontSize: 12, color: "var(--rc)", margin: 0 }}>{addToContactsError}</p>
            )}
            {/* Actions */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="outline" size="sm" onClick={() => setAddToContactsFor(null)}>Cancel</Button>
              <Button size="sm" disabled={!addToContactsName.trim() || addToContactsSaving}
                onClick={handleAddToContacts}>
                {addToContactsSaving ? "Saving…" : "Save contact"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Session expired banner */}
      {sessionExpired && (
        <div style={{ padding: "12px 16px", background: "var(--rb)", border: "1px solid var(--rc)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--rc)", fontWeight: 500 }}>
            Your session has expired. Please log out and log back in.
          </span>
          <button
            onClick={() => { window.location.href = "/api/auth/sign-out"; }}
            style={{ padding: "5px 14px", background: "var(--rc)", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Log out
          </button>
        </div>
      )}
      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Inbox</h1>
            <p style={{ color: "var(--t2)", fontSize: 13, marginTop: 4 }}>
              {loading ? <span className="inline-block h-3 w-32 bg-muted/60 animate-pulse rounded align-middle" /> : `${totalUnread} unread`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 4, background: "var(--muted)", borderRadius: 8, padding: 3, flexWrap: "wrap" }}>
            {(["all", "unread", "archived", "starred", "unknown"] as Filter[]).map((f) => {
              const label =
                f === "all" ? `All ${conversations.filter((c) => !c.archived).length}` :
                f === "unread" ? `Unread ${totalUnread}` :
                f === "archived" ? `Archived ${totalArchived}` :
                f === "starred" ? `Starred ${totalStarred}` :
                `Unknown ${totalUnknown}`;
              const isUnknownTab = f === "unknown";
              const isArchivedTab = f === "archived";
              return (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap",
                    background: filter === f ? (isUnknownTab ? "#f59e0b" : isArchivedTab ? "var(--t3)" : "var(--card)") : "transparent",
                    boxShadow: filter === f ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    color: filter === f ? (isUnknownTab || isArchivedTab ? "#fff" : "var(--t1)") : isUnknownTab && totalUnknown > 0 ? "#f59e0b" : "var(--t3)",
                    fontWeight: filter === f ? 600 : 400 }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        {/* Platform filter chips — only shown when 2+ platforms have messages */}
        {activePlatforms.length > 1 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 500 }}>Channel:</span>
            <button
              onClick={() => setPlatformFilter("all")}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20,
                border: `1px solid ${platformFilter === "all" ? "var(--t1)" : "var(--bd)"}`,
                background: platformFilter === "all" ? "var(--t1)" : "transparent",
                color: platformFilter === "all" ? "var(--bg)" : "var(--t2)",
                fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              All
            </button>
            {activePlatforms.map(([platform, count]) => {
              const active = platformFilter === platform;
              const brandColor = PLATFORM_COLOR[platform] ?? "var(--t2)";
              return (
                <button key={platform}
                  onClick={() => setPlatformFilter(active ? "all" : platform)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20,
                    border: `1px solid ${active ? brandColor : "var(--bd)"}`,
                    background: active ? `${brandColor}22` : "transparent",
                    color: active ? brandColor : "var(--t2)",
                    fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                  <PlatformIcon type={platform as PlatformType} size={11} />
                  {PLATFORM_LABEL[platform] ?? platform}
                  <span style={{ opacity: 0.7 }}>{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Two-panel layout */}
      <div className="grid flex-1 min-h-0 gap-3 [grid-template-columns:1fr] md:[grid-template-columns:300px_1fr]">

        {/* Left: Conversation list — hidden on mobile when thread is open */}
        <div className={`rounded-xl border border-border bg-card shadow-sm flex flex-col overflow-y-auto ${selected ? "hidden md:flex" : "flex"}`}>
          {/* Search bar */}
          <div style={{ padding: "10px 10px 8px", borderBottom: "1px solid var(--bd)" }}>
            <div style={{ position: "relative" }}>
              <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--t3)" }}
                width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search messages…"
                style={{ width: "100%", padding: "7px 30px 7px 30px", borderRadius: 8, border: "1px solid var(--bd)",
                  background: "var(--muted)", fontSize: 12, color: "var(--t1)", outline: "none",
                  boxSizing: "border-box" }}
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              )}
            </div>
          </div>
          {loading && conversations.length === 0 ? (
            <div className="flex flex-col gap-0 p-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-lg">
                  <div className="size-9 rounded-full bg-muted/60 animate-pulse shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex justify-between gap-2">
                      <div className="h-3 bg-muted/60 animate-pulse rounded w-28" />
                      <div className="h-2.5 bg-muted/60 animate-pulse rounded w-8" />
                    </div>
                    <div className="h-2.5 bg-muted/60 animate-pulse rounded w-44" />
                  </div>
                </div>
              ))}
            </div>
          ) : searchQuery.trim() ? (
            // Search results
            <div style={{ padding: "8px 6px" }}>
              {searchLoading ? (
                <div style={{ padding: "20px 0", textAlign: "center", fontSize: 12, color: "var(--t3)" }}>Searching…</div>
              ) : searchResults.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", fontSize: 12, color: "var(--t3)" }}>No results for "{searchQuery}"</div>
              ) : searchResults.map((msg) => {
                const matchConv = conversations.find((c) => c.contactId === msg.contactId && c.platform === msg.platform);
                return (
                  <button key={msg.id}
                    onClick={() => { if (matchConv) selectConversation(matchConv); setSearchQuery(""); setSearchResults([]); }}
                    style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
                      padding: "9px 10px", borderRadius: 8, background: "transparent", border: "none",
                      cursor: "pointer", textAlign: "left", transition: "background 0.1s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--al)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                      <PlatformIcon type={msg.platform as PlatformType} size={11} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {msg.contactName ?? msg.senderId ?? "Unknown"}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--t3)", flexShrink: 0 }}>{fmtAgo(msg.receivedAt)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: msg.fromMe ? "var(--t3)" : "var(--t2)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%",
                      paddingLeft: 17 }}>
                      {msg.fromMe && <span style={{ color: "var(--t3)" }}>You: </span>}
                      {msg.preview ?? msg.body ?? ""}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: "var(--t3)" }}>
              {conversations.length === 0
                ? "No messages yet. Connect integrations in Settings."
                : "Nothing here."}
            </div>
          ) : (() => {
            const knownConvs = filtered.filter((c) => !!c.contactId);
            const unknownConvs = filtered.filter((c) => !c.contactId);

            const renderConv = (conv: InboxConversationApi) => {
              const isActive = selected?.key === conv.key;
              const isUnknown = !conv.contactId;
              const name = conv.contactName ?? (isUnknown ? formatSenderId(conv.platform, conv.senderId) : conv.latestMessage.externalId);
              return (
                <button key={conv.key} onClick={() => selectConversation(conv)}
                  style={{
                    width: "100%", display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "12px 14px", background: isActive ? "var(--al)" : "transparent",
                    border: "none", borderBottom: "1px solid var(--bd)", cursor: "pointer",
                    textAlign: "left",
                    borderLeft: isActive ? "3px solid var(--ac)" : conv.unreadCount > 0 ? "3px solid #2563eb" : "3px solid transparent",
                  }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                    background: isActive ? "var(--ac)" : isUnknown ? "#f59e0b" : "var(--muted)",
                    color: isActive || isUnknown ? "#fff" : "var(--t2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {initials(conv.contactName)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                      <PlatformIcon type={conv.platform as PlatformType} size={13} />
                      <span style={{
                        fontSize: 13, fontWeight: conv.unreadCount > 0 ? 700 : 600,
                        color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap", flex: 1,
                      }}>
                        {name}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--t3)", flexShrink: 0, marginLeft: 2 }}>
                        {fmtAgo(conv.latestMessage.receivedAt)}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 12, color: conv.unreadCount > 0 ? "var(--t2)" : "var(--t3)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      fontWeight: conv.unreadCount > 0 ? 500 : 400, marginBottom: 5,
                    }}>
                      {cleanPreview(conv.latestMessage.preview ?? conv.latestMessage.body ?? "")}
                    </div>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      {conv.unreadCount > 0 && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10,
                          background: "#2563eb", color: "#fff",
                        }}>
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            };

            return (
              <>
                {knownConvs.map(renderConv)}
                {unknownConvs.length > 0 && (
                  <>
                    {filter !== "unknown" && (
                      <div style={{
                        padding: "8px 14px 6px", display: "flex", alignItems: "center", gap: 8,
                        borderBottom: "1px solid var(--bd)", borderTop: knownConvs.length > 0 ? "2px solid var(--bd)" : "none",
                        background: "var(--muted)",
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                          Not in contacts
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
                          background: "#f59e0b", color: "#fff",
                        }}>
                          {unknownConvs.length}
                        </span>
                      </div>
                    )}
                    {unknownConvs.map(renderConv)}
                  </>
                )}
              </>
            );
          })()}
        </div>

        {/* Right: Thread view — hidden on mobile when no thread selected */}
        <div className={`rounded-xl border border-border bg-card shadow-sm flex flex-col overflow-hidden ${!selected ? "hidden md:flex" : "flex"}`}>
          {!selected ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--t3)" }}>
              {loading ? (
                <div className="flex flex-col gap-4 w-64 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-muted/60 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-muted/60 rounded w-28" />
                      <div className="h-2.5 bg-muted/60 rounded w-20" />
                    </div>
                  </div>
                  <div className="space-y-2 pl-1">
                    <div className="h-2.5 bg-muted/60 rounded w-full" />
                    <div className="h-2.5 bg-muted/60 rounded w-5/6" />
                    <div className="h-2.5 bg-muted/60 rounded w-4/6" />
                  </div>
                </div>
              ) : conversations.length === 0
                ? <span style={{ textAlign: "center" }}>No messages yet.<br /><br />Connect integrations in <strong>Settings</strong>.</span>
                : "Select a conversation"}
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--bd)",
                display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {/* Back button — mobile only */}
                <button className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted"
                  onClick={() => setSelected(null)}
                  style={{ border: "none", background: "transparent", cursor: "pointer", flexShrink: 0, color: "var(--t1)", fontSize: 18 }}>
                  ←
                </button>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--al)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, color: "var(--t1)", flexShrink: 0 }}>
                  {initials(selected.contactName)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t1)" }}>
                    {selected.contactName ?? (selected.contactId ? selected.latestMessage.externalId : formatSenderId(selected.platform, selected.senderId))}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--t3)", display: "flex", alignItems: "center", gap: 4 }}>
                    <PlatformIcon type={selected.platform as PlatformType} size={10} />
                    {PLATFORM_LABEL[selected.platform] ?? selected.platform}
                    {selected.messageCount > 1 && ` · ${selected.messageCount} messages`}
                    {!selected.contactId && <span style={{ color: "#f59e0b", fontWeight: 600 }}> · Not in contacts</span>}
                    {selected.platform === "whatsapp" && selected.senderId && typingContactIds.has(selected.senderId) && (
                      <span style={{ color: "#25d366", fontWeight: 600, fontStyle: "italic", marginLeft: 4 }}>typing…</span>
                    )}
                    {threadLoading && (
                      <span className="inline-flex items-center gap-1 ml-2 opacity-50">
                        <span className="size-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="size-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="size-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                      </span>
                    )}
                  </div>
                </div>
                <div role="button" tabIndex={0}
                  onClick={async () => {
                    const next = !selected.starred;
                    if (selected.latestMessage?.id) {
                      await inboxApi.update(selected.latestMessage.id, { starred: next });
                    }
                    setConversations((prev) => prev.map((c) =>
                      c.key === selected.key
                        ? { ...c, starred: next, latestMessage: c.latestMessage ? { ...c.latestMessage, starred: next } : c.latestMessage }
                        : c
                    ));
                    setSelected((s) => s ? { ...s, starred: next, latestMessage: s.latestMessage ? { ...s.latestMessage, starred: next } : s.latestMessage } : s);
                  }}
                  style={{ cursor: "pointer", color: selected.starred ? "#f59e0b" : "var(--t3)",
                    display: "flex", alignItems: "center", padding: 4, borderRadius: 6,
                    background: "transparent", border: "none" }}>
                  <Star size={18} fill={selected.starred ? "#f59e0b" : "none"} />
                </div>
                <div role="button" tabIndex={0}
                  onClick={() => handleArchive(selected)}
                  title={selected.archived ? "Unarchive" : "Archive"}
                  style={{ cursor: "pointer", color: selected.archived ? "#6366f1" : "var(--t3)",
                    display: "flex", alignItems: "center", padding: 4, borderRadius: 6,
                    background: "transparent", border: "none" }}>
                  {selected.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
                </div>
                {selected.contactId ? (
                  <Button size="sm" variant="outline"
                    onClick={() => router.push(`/dashboard/contacts/${selected.contactId}`)}>
                    Open contact
                  </Button>
                ) : (
                  <Button size="sm" variant="outline"
                    style={{ borderColor: "#f59e0b", color: "#92400e" }}
                    onClick={() => {
                      setAddToContactsName(selected.contactName ?? "");
                      setAddToContactsError("");
                      setAddToContactsFor(selected);
                    }}>
                    + Add to contacts
                  </Button>
                )}
              </div>

              {/* Messages thread */}
              <div ref={scrollContainerRef} style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex",
                flexDirection: "column", gap: 12 }}>
                {/* Load older messages */}
                {selected.contactId && thread.length >= 50 && !noMoreMessages && (
                  <div style={{ textAlign: "center" }}>
                    <button
                      onClick={async () => {
                        if (loadingMore || !selected.contactId) return;
                        setLoadingMore(true);
                        try {
                          const oldest = thread[0];
                          if (!oldest) return;
                          const more = await inboxApi.getThreadMore(selected.contactId, selected.platform, oldest.receivedAt);
                          if (more.length === 0) {
                            setNoMoreMessages(true);
                          } else {
                            // Set flag RIGHT before setThread so SSE updates during the API call don't clear it early
                            loadMoreRestoreRef.current = scrollContainerRef.current?.scrollHeight ?? null;
                            isLoadingMoreRef.current = true;
                            setThread((prev) => {
                              const ids = new Set(prev.map((m) => m.id));
                              return [...more.filter((m) => !ids.has(m.id)), ...prev];
                            });
                            if (more.length < 50) setNoMoreMessages(true);
                          }
                        } catch { isLoadingMoreRef.current = false; /* no re-render, clear manually */ }
                        finally { setLoadingMore(false); }
                      }}
                      disabled={loadingMore}
                      style={{ fontSize: 11, color: "var(--t3)", background: "var(--muted)", border: "1px solid var(--bd)",
                        borderRadius: 12, padding: "4px 14px", cursor: loadingMore ? "default" : "pointer", opacity: loadingMore ? 0.6 : 1 }}>
                      {loadingMore ? "Loading…" : "Load older messages"}
                    </button>
                  </div>
                )}
                {(() => {
                  // Merge DB thread + locally sent, sort by time
                  const contactInitials = initials(selected.contactName);
                  const myInitials = initials(me.name ?? me.email ?? "Me");
                  type AnyMsg = InboxMessageApi | SentMessage;
                  // Dedup inline: skip local sent messages that already exist in DB thread
                  const dbBodySet = new Set(thread.filter((m) => m.fromMe).map((m) => m.body ?? ""));
                  const localOnly = (sentMessages[selected.key] ?? []).filter((m) => !dbBodySet.has(m.body));
                  const all: AnyMsg[] = [
                    ...thread,
                    ...localOnly,
                  ].sort((a, b) => {
                    const ta = "sentAt" in a ? a.sentAt : a.receivedAt;
                    const tb = "sentAt" in b ? b.sentAt : b.receivedAt;
                    return +new Date(ta) - +new Date(tb);
                  });

                  return all.map((msg) => {
                    const isMe = msg.fromMe;
                    const text = "body" in msg ? (msg.body ?? (msg as any).preview ?? "") : (msg as SentMessage).body;
                    const time = "sentAt" in msg ? msg.sentAt : (msg as InboxMessageApi).receivedAt;
                    const isHovered = hoveredMsgId === msg.id;
                    const canDelete = "receivedAt" in msg; // only DB messages, not local sent

                    const status = "status" in msg ? (msg as SentMessage).status : undefined;
                    const isSending = status === "sending";
                    const isFailed = status === "failed";
                    const isDelivered = status === "delivered";

                    return (
                      <div key={msg.id}
                        onMouseEnter={() => setHoveredMsgId(msg.id)}
                        onMouseLeave={() => { setHoveredMsgId(null); setReactionPickerId(null); }}
                        style={{ display: "flex", alignItems: "flex-end", gap: 6,
                          flexDirection: isMe ? "row-reverse" : "row" }}>
                        {/* Avatar */}
                        <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                          background: isMe ? "#2563eb" : "var(--al)",
                          color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700 }}>
                          {isMe ? myInitials : contactInitials}
                        </div>
                        {/* Bubble */}
                        <div style={{ display: "flex", flexDirection: "column",
                          alignItems: isMe ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                          <div style={{
                            background: isMe ? "#2563eb" : "var(--al)",
                            color: isMe ? "#fff" : "var(--t1)",
                            borderRadius: isMe ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
                            padding: "8px 12px", fontSize: 13, lineHeight: 1.5, wordBreak: "break-word",
                            opacity: isSending ? 0.7 : 1,
                          }}>
                            {/* Quoted message bubble — works for both DB messages and optimistic SentMessages */}
                            {(() => {
                              const qBody = (msg as any).quotedBody;
                              const qFromMe = (msg as any).quotedFromMe;
                              if (!qBody) return null;
                              return (
                                <div style={{
                                  fontSize: 11, marginBottom: 6, padding: "4px 8px",
                                  borderLeft: `2px solid ${isMe ? "rgba(255,255,255,0.5)" : "#2563eb"}`,
                                  background: isMe ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.05)",
                                  borderRadius: "0 4px 4px 0",
                                  color: isMe ? "rgba(255,255,255,0.75)" : "var(--t2)",
                                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                  <span style={{ fontWeight: 600, marginRight: 4 }}>
                                    {qFromMe ? (me.name ?? "You") : (selected.contactName ?? "Contact")}:
                                  </span>
                                  {qBody}
                                </div>
                              );
                            })()}
                            {renderMessageBody(text, setLightboxUrl)}
                          </div>
                          {/* Reaction badge */}
                          {localReactions[msg.id] && (
                            <div style={{
                              marginTop: 3, alignSelf: isMe ? "flex-end" : "flex-start",
                              fontSize: 16, lineHeight: 1, background: "var(--card)",
                              border: "1px solid var(--bd)", borderRadius: 12,
                              padding: "2px 6px", display: "inline-block",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                            }}>
                              {localReactions[msg.id]}
                            </div>
                          )}
                          <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 3,
                            display: "flex", gap: 5, alignItems: "center" }}>
                            {fmtAgo(time)}
                            {isMe && (() => {
                              const dbStatus = "waStatus" in msg ? (msg as InboxMessageApi).waStatus : undefined;
                              if (isSending) return (
                                <span className="inline-block rounded-full border border-current border-t-transparent animate-spin"
                                  style={{ width: 10, height: 10, opacity: 0.6 }} />
                              );
                              if (isFailed) return <span style={{ color: "var(--rc)", fontWeight: "bold" }} title="Delivery failed">⚠️</span>;
                              if (isDelivered) return <span style={{ color: "#53bdeb", fontSize: 13 }} title="Delivered to Beeper">✓✓</span>;
                              if (dbStatus === "read" || dbStatus === "played") return <span style={{ color: "#53bdeb", fontSize: 13 }} title="Read">✓✓</span>;
                              if (dbStatus === "delivered") return <span style={{ color: "var(--t3)", fontSize: 13 }} title="Delivered">✓✓</span>;
                              return <span style={{ color: "var(--t3)", fontSize: 13 }} title="Sent">✓</span>;
                            })()}
                          </div>
                        </div>
                        {/* Action buttons on hover */}
                        {isHovered && canDelete && (
                          <div style={{ flexShrink: 0, alignSelf: "center", display: "flex", flexDirection: isMe ? "row-reverse" : "row", gap: 2, position: "relative" }}>
                            {/* Reply button */}
                            <button
                              onClick={() => setReplyingTo(msg as InboxMessageApi)}
                              title="Reply"
                              style={{ background: "transparent", color: "var(--t3)", border: "none",
                                borderRadius: 4, width: 24, height: 24, fontSize: 13, cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center" }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = "#2563eb")}
                              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t3)")}>
                              ↩
                            </button>
                            {/* Emoji reaction button */}
                            <div style={{ position: "relative" }}>
                              <button
                                onClick={() => setReactionPickerId(reactionPickerId === msg.id ? null : msg.id)}
                                title="React with emoji"
                                style={{ background: "transparent", color: "var(--t3)", border: "none",
                                  borderRadius: 4, width: 24, height: 24, fontSize: 13, cursor: "pointer",
                                  display: "flex", alignItems: "center", justifyContent: "center" }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = "#f59e0b")}
                                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t3)")}>
                                😊
                              </button>
                              {reactionPickerId === msg.id && (
                                <div style={{
                                  position: "absolute", bottom: 30,
                                  [isMe ? "right" : "left"]: 0,
                                  background: "var(--card)", border: "1px solid var(--bd)",
                                  borderRadius: 10, padding: "6px 8px", display: "flex", gap: 4,
                                  boxShadow: "0 4px 16px rgba(0,0,0,0.15)", zIndex: 50,
                                }}>
                                  {REACTIONS.map((emoji) => (
                                    <button key={emoji}
                                      onClick={() => {
                                        setReactionPickerId(null);
                                        setLocalReactions((prev) => ({ ...prev, [msg.id]: emoji }));
                                        inboxApi.react(msg.id, emoji).catch(() => {});
                                      }}
                                      style={{ background: "transparent", border: "none", cursor: "pointer",
                                        fontSize: 20, padding: "2px 3px", borderRadius: 6,
                                        transition: "transform 0.1s" }}
                                      onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.3)")}
                                      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
                <div ref={bottomRef} />
              </div>

              {/* Reply box */}
              <div style={{ padding: "8px 12px", borderTop: "1px solid var(--bd)",
                background: "var(--sf2)", flexShrink: 0 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,application/pdf,.zip,.txt,.doc,.docx"
                  style={{ display: "none" }}
                  onChange={handleFileUpload}
                />
                {/* Pending attachment preview */}
                {pendingAttachment && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
                    padding: "6px 10px", borderRadius: 8, background: "var(--muted)",
                    border: "1px solid var(--bd)" }}>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      {pendingAttachment.isImage ? (
                        <img src={pendingAttachment.previewUrl} alt={pendingAttachment.name}
                          style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, display: "block",
                            opacity: pendingAttachment.uploading ? 0.5 : 1, transition: "opacity 0.2s" }} />
                      ) : (
                        <div style={{ width: 48, height: 48, borderRadius: 6, background: "var(--al)",
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                          📎
                        </div>
                      )}
                      {pendingAttachment.uploading && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
                          justifyContent: "center", borderRadius: 6 }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "var(--t1)", fontWeight: 500,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {pendingAttachment.name}
                      </div>
                      {pendingAttachment.uploading ? (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ height: 4, borderRadius: 2, background: "var(--bd)", overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 2, background: "#2563eb",
                              width: `${pendingAttachment.uploadProgress ?? 0}%`, transition: "width 0.15s ease" }} />
                          </div>
                          <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>
                            Uploading {pendingAttachment.uploadProgress ?? 0}%
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "var(--t3)" }}>
                          {pendingAttachment.isImage ? "Ready to send" : "File ready to send"}
                        </div>
                      )}
                    </div>
                    <button onClick={() => { if (pendingAttachment.blobUrl) URL.revokeObjectURL(pendingAttachment.blobUrl); setPendingAttachment(null); }}
                      disabled={pendingAttachment.uploading}
                      style={{ background: "none", border: "none", cursor: pendingAttachment.uploading ? "not-allowed" : "pointer",
                        color: "var(--t3)", fontSize: 18, lineHeight: 1, flexShrink: 0,
                        opacity: pendingAttachment.uploading ? 0.4 : 1 }}>×</button>
                  </div>
                )}
                {/* Reply-to quote preview */}
                {replyingTo && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
                    padding: "6px 10px", borderRadius: 8, background: "var(--al)",
                    borderLeft: "3px solid #2563eb" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#2563eb", marginBottom: 2 }}>
                        {replyingTo.fromMe ? (me.name ?? "You") : (replyingTo.contactName ?? "Contact")}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--t2)", overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {replyingTo.body ?? replyingTo.preview ?? ""}
                      </div>
                    </div>
                    <button onClick={() => setReplyingTo(null)}
                      style={{ background: "none", border: "none", cursor: "pointer",
                        color: "var(--t3)", fontSize: 18, lineHeight: 1, flexShrink: 0 }}>×</button>
                  </div>
                )}
                {/* Unified compose row */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 0,
                  border: "1px solid var(--bd)", borderRadius: 12,
                  background: "var(--card)",
                }}>
                  {/* Paperclip button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    title="Attach file"
                    style={{ flexShrink: 0, height: 40, width: 38, border: "none",
                      borderRight: "1px solid var(--bd)",
                      borderRadius: "11px 0 0 11px",
                      background: "transparent", cursor: uploading ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "var(--t3)", opacity: uploading ? 0.4 : 1 }}>
                    {uploading ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    )}
                  </button>
                  {/* Emoji picker button */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <button
                      onClick={() => setShowEmojiPicker((v) => !v)}
                      title="Insert emoji"
                      style={{ height: 40, width: 36, border: "none", borderRight: "1px solid var(--bd)",
                        background: "transparent", cursor: "pointer", display: "flex",
                        alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                      😊
                    </button>
                    {showEmojiPicker && (
                      <div style={{
                        position: "absolute", bottom: 48, left: 0, zIndex: 60,
                        background: "var(--card)", border: "1px solid var(--bd)", borderRadius: 12,
                        padding: "8px", width: 196, boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                      }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 2 }}>
                          {EMOJI_LIST.map((em) => (
                            <button key={em} onClick={() => insertEmoji(em)}
                              style={{ background: "transparent", border: "none", cursor: "pointer",
                                fontSize: 22, padding: "4px", borderRadius: 6, lineHeight: 1 }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--al)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                              {em}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <textarea ref={textareaRef}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                    onPaste={handlePaste}
                    onClick={() => setShowEmojiPicker(false)}
                    placeholder={`Message ${selected.contactName ?? ""}…`}
                    rows={1} style={{ flex: 1, resize: "none", fontSize: 13, padding: "10px 10px",
                      border: "none", background: "transparent",
                      color: "var(--t1)", outline: "none", lineHeight: 1.45,
                      minHeight: 40, maxHeight: 120, overflowY: "auto" }} />
                  <button onClick={handleSend}
                    style={{ flexShrink: 0, height: 40, paddingInline: 16, border: "none",
                      borderLeft: "1px solid var(--bd)",
                      borderRadius: "0 11px 11px 0",
                      background: "transparent", color: "#2563eb",
                      fontWeight: 600, fontSize: 13, cursor: "pointer", letterSpacing: 0.2 }}>
                    Send
                  </button>
                </div>
                {sendError && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 6,
                    padding: "8px 12px", borderRadius: 8, background: "rgba(220,38,38,0.08)",
                    border: "1px solid rgba(220,38,38,0.25)" }}>
                    <span style={{ fontSize: 15, flexShrink: 0 }}>⚠️</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, color: "var(--rc)", margin: 0, fontWeight: 500 }}>
                        {sendError}
                      </p>
                      {(sendError.includes("Settings") || sendError.includes("reconnect") || sendError.includes("re-authorization")) && (
                        <a href="/dashboard/settings" style={{ fontSize: 11, color: "var(--rc)", textDecoration: "underline", display: "inline-block", marginTop: 2 }}>
                          Go to Settings →
                        </a>
                      )}
                    </div>
                    <button onClick={() => setSendError("")}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--rc)",
                        fontSize: 16, lineHeight: 1, flexShrink: 0, padding: 0 }}>×</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
