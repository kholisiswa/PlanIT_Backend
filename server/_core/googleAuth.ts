import express from "express";
import axios from "axios";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { serializeSessionCookie } from "./cookies";
import { getDb } from "../db";
import { users, type User } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { isRedirectUriAllowed } from "./cors";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const DEFAULT_REDIRECT_TARGET = "/dashboard";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL;

type GoogleState = {
  redirectUri: string;
  nonce: string;
};

function encodeState(payload: GoogleState) {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function decodeState(value: string): GoogleState | null {
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (typeof parsed?.redirectUri === "string" && typeof parsed?.nonce === "string") {
      return parsed;
    }
  } catch (err) {
    console.warn("[Google Auth] Failed to decode state", err);
  }
  return null;
}

function getSafeRedirectUri(uri?: string | null) {
  if (uri && isRedirectUriAllowed(uri)) return uri;
  return DEFAULT_REDIRECT_TARGET;
}

const router = express.Router();

router.get("/api/auth/google", (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET || !CALLBACK_URL) {
    console.error("[Google Auth] Missing configuration");
    res.status(500).json({ error: "Google OAuth is not configured" });
    return;
  }

  const redirectRequest =
    typeof req.query.redirectUri === "string" ? req.query.redirectUri : null;
  const redirectUri = getSafeRedirectUri(redirectRequest);
  const state = encodeState({
    redirectUri,
    nonce: randomBytes(12).toString("hex"),
  });

  const loginHint =
    typeof req.query.emailHint === "string" && req.query.emailHint.trim()
      ? req.query.emailHint.trim()
      : undefined;

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", CALLBACK_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("include_granted_scopes", "true");
  if (loginHint) {
    authUrl.searchParams.set("login_hint", loginHint);
  }

  res.redirect(authUrl.toString());
});

router.get("/api/auth/google/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const stateValue = typeof req.query.state === "string" ? req.query.state : null;

  if (!code || !stateValue) {
    res.status(400).json({ error: "Missing code or state" });
    return;
  }

  const state = decodeState(stateValue);
  const redirectTo = getSafeRedirectUri(state?.redirectUri);

  if (!CLIENT_ID || !CLIENT_SECRET || !CALLBACK_URL || !process.env.JWT_SECRET) {
    console.error("[Google Auth] Missing configuration for callback");
    res.status(500).json({ error: "OAuth callback is not configured" });
    return;
  }

  try {
    const params = new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: CALLBACK_URL,
      grant_type: "authorization_code",
    });

    const tokenResponse = await axios.post(GOOGLE_TOKEN_URL, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const tokenData = tokenResponse.data;
    const accessToken = tokenData?.access_token;

    if (!accessToken) {
      throw new Error("Google did not return an access token");
    }

    const userInfoResponse = await axios.get(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const userInfo = userInfoResponse.data;
    const { sub, email, email_verified, name } = userInfo;

    if (!sub || !email) {
      throw new Error("Google response missing required user info");
    }

    if (!email_verified) {
      console.warn("[Google Auth] Email is not verified by Google:", email);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const openId = `google:${sub}`;
    const db = await getDb();
    const now = new Date();

    const [existingByOpenId] = await db
      .select()
      .from(users)
      .where(eq(users.openId, openId))
      .limit(1);

    let existingByEmail: User | undefined;
    if (!existingByOpenId && normalizedEmail) {
      const [foundByEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);
      existingByEmail = foundByEmail;
    }

    let persistedUser: User | undefined = existingByOpenId ?? existingByEmail;

    if (persistedUser) {
      const [updated] = await db
        .update(users)
        .set({
          openId,
          name: name ?? persistedUser.name,
          email: normalizedEmail,
          loginMethod: "google",
          lastSignedIn: now,
        })
        .where(eq(users.id, persistedUser.id))
        .returning();

      persistedUser = updated;
    } else {
      const [inserted] = await db
        .insert(users)
        .values({
          openId,
          name: name ?? "",
          email: normalizedEmail,
          loginMethod: "google",
          lastSignedIn: now,
          password: null,
        })
        .returning();

      persistedUser = inserted;
    }

    if (!persistedUser) {
      throw new Error("Unable to persist Google user");
    }

    const jwtToken = jwt.sign({ id: persistedUser.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.setHeader("Set-Cookie", serializeSessionCookie(jwtToken, req));
    res.redirect(redirectTo);
  } catch (err) {
    console.error("[Google Auth] callback error:", err);
    res.status(500).json({ error: "Failed to sign in with Google" });
  }
});

export function registerGoogleAuthRoutes(app: express.Express) {
  app.use(router);
}
