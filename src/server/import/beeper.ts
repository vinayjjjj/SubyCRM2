import Database from "better-sqlite3";
import path from "path";
import os from "os";

const BEEPER_DB = path.join(os.homedir(), "Library", "Application Support", "BeeperTexts", "index.db");

const BRIDGE_TO_PLATFORM: Record<string, "whatsapp" | "telegram" | "x" | "linkedin"> = {
  whatsapp: "whatsapp",
  telegram: "telegram",
  twitter: "x",
  linkedin: "linkedin",
};

export interface BeeperContact {
  name: string;
  platform: "whatsapp" | "telegram" | "x" | "linkedin";
  platformId: string;
  lastMessageTs: number | null;
}

export function importFromBeeper(): { contacts: BeeperContact[]; errors: string[] } {
  const contacts: BeeperContact[] = [];
  const errors: string[] = [];

  try {
    const db = new Database(BEEPER_DB, { readonly: true });

    // Only import from 1:1 conversations (DMs), not group chats.
    // A DM room has exactly 2 participants (self + contact).
    const rows = db.prepare(`
      SELECT
        pi.account_id,
        p.id           AS participant_id,
        p.full_name,
        pi.identifier,
        pi.identifier_type,
        MAX(t.timestamp) AS last_ts
      FROM participant_identifiers pi
      JOIN participants p
        ON p.id = pi.participant_id AND p.account_id = pi.account_id
      JOIN threads t
        ON t.accountID = pi.account_id AND t.threadID = p.room_id
        AND t.timestamp > 0 AND t.is_label = 0
      WHERE p.is_self = 0
        AND (p.is_network_bot IS NULL OR p.is_network_bot = 0)
        AND (p.has_exited IS NULL OR p.has_exited = 0)
        AND p.full_name IS NOT NULL AND p.full_name != ''
        AND pi.account_id IN ('whatsapp', 'telegram', 'twitter', 'linkedin')
        -- only 1-on-1 rooms (self + this person)
        AND (
          SELECT COUNT(*) FROM participants px
          WHERE px.room_id = p.room_id AND px.account_id = p.account_id
        ) <= 2
      GROUP BY pi.account_id, p.id, pi.identifier_type
      ORDER BY last_ts DESC
    `).all() as Array<{
      account_id: string;
      participant_id: string;
      full_name: string;
      identifier: string;
      identifier_type: string;
      last_ts: number | null;
    }>;

    // Deduplicate: one entry per (bridge, participant).
    // For WhatsApp/Telegram: prefer phone identifier.
    // For Twitter/LinkedIn: use username/member-id.
    const seen = new Map<string, BeeperContact>();

    for (const row of rows) {
      const platform = BRIDGE_TO_PLATFORM[row.account_id];
      if (!platform) continue;

      let platformId = row.identifier.trim();
      if (!platformId) continue;

      // Normalise: strip leading @ for telegram/twitter (our DB convention)
      if (platform === "telegram" || platform === "x") {
        platformId = platformId.replace(/^@+/, "");
      }

      const key = `${row.account_id}:${row.participant_id}`;
      const existing = seen.get(key);
      const preferPhone = platform === "whatsapp" || platform === "telegram";

      if (!existing) {
        seen.set(key, {
          name: row.full_name.trim(),
          platform,
          platformId,
          lastMessageTs: row.last_ts ?? null,
        });
      } else if (preferPhone && row.identifier_type === "phone") {
        // Replace whatever we had with the actual phone number
        seen.set(key, { ...existing, platformId });
      } else if (!preferPhone && row.identifier_type === "username" && existing.identifier_type !== "username") {
        seen.set(key, { ...existing, platformId });
      }
    }

    contacts.push(...seen.values());
    db.close();

    const byPlatform: Record<string, number> = {};
    for (const c of contacts) byPlatform[c.platform] = (byPlatform[c.platform] ?? 0) + 1;
    console.log(`[beeper] Found ${contacts.length} DM contacts:`, byPlatform);
  } catch (err) {
    const msg = `Failed to read Beeper DB: ${err instanceof Error ? err.message : String(err)}`;
    errors.push(msg);
    console.error(`[beeper] ${msg}`);
  }

  return { contacts, errors };
}
