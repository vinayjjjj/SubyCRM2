import crypto from "crypto";
import { prisma } from "../lib/prisma";

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || "";
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || "";
const REDIRECT_URI = `${process.env.AUTH_BASE_URL || "http://localhost:4002"}/api/linkedin/callback`;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3005";

// Sign userId into state so hot-reloads don't wipe the pending Map
function signState(userId: string): string {
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = `${userId}:${nonce}`;
  const sig = crypto.createHmac("sha256", CLIENT_SECRET || "dev").update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyState(state: string): string {
  try {
    const decoded = Buffer.from(state, "base64url").toString();
    const lastColon = decoded.lastIndexOf(":");
    const payload = decoded.slice(0, lastColon);
    const sig = decoded.slice(lastColon + 1);
    const expected = crypto.createHmac("sha256", CLIENT_SECRET || "dev").update(payload).digest("hex");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      throw new Error("bad sig");
    }
    const userId = payload.split(":")[0];
    if (!userId) throw new Error("no userId");
    return userId;
  } catch {
    throw new Error("LinkedIn OAuth state invalid or expired");
  }
}

export const linkedinService = {
  buildAuthUrl(userId: string): string {
    if (!CLIENT_ID) throw new Error("LINKEDIN_CLIENT_ID not configured in .env.local");
    const state = signState(userId);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: "openid profile email",
      state,
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
  },

  async handleCallback(code: string, state: string): Promise<void> {
    const userId = verifyState(state);

    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[linkedin] token exchange failed:", errText);
      throw new Error(`LinkedIn token exchange failed: ${errText}`);
    }
    const tokenData = await tokenRes.json() as { access_token: string };

    // Try OpenID Connect userinfo first, fall back to legacy /v2/me
    let profileId: string | null = null;
    let displayName: string | null = null;

    const userInfoRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (userInfoRes.ok) {
      const p = await userInfoRes.json() as { sub?: string; name?: string; given_name?: string; family_name?: string };
      profileId = p.sub ?? null;
      displayName = p.name ?? ([p.given_name, p.family_name].filter(Boolean).join(" ") || null);
    } else {
      console.warn("[linkedin] /v2/userinfo failed, trying legacy /v2/me");
      const legacyRes = await fetch(
        "https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)",
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
      );
      if (legacyRes.ok) {
        const p = await legacyRes.json() as { id?: string; localizedFirstName?: string; localizedLastName?: string };
        profileId = p.id ?? null;
        displayName = [p.localizedFirstName, p.localizedLastName].filter(Boolean).join(" ") || null;
      }
    }

    await (prisma as any).linkedInToken.upsert({
      where: { userId },
      create: { userId, accessToken: tokenData.access_token, profileId, profileName: displayName },
      update: { accessToken: tokenData.access_token, profileId, profileName: displayName },
    });
  },

  async getStatus(userId: string) {
    const rec = await (prisma as any).linkedInToken.findUnique({ where: { userId } }).catch(() => null);
    if (!rec) return { connected: false, profileName: null };
    return { connected: true, profileName: rec.profileName };
  },

  async disconnect(userId: string) {
    await (prisma as any).linkedInToken.deleteMany({ where: { userId } });
  },

  get callbackRedirect() { return `${FRONTEND_URL}/dashboard/settings?linkedin=connected`; },
  get callbackErrorRedirect() { return `${FRONTEND_URL}/dashboard/settings?linkedin=error`; },
};
