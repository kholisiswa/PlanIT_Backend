import { AXIOS_TIMEOUT_MS, COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import type { Request, Response } from "express";
import { getSessionCookieOptions } from "./cookies";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { ENV } from "./env";
import type {
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtRequest,
  GetUserInfoWithJwtResponse,
} from "./types/planTypes";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;

class OAuthService {
  constructor(private client: ReturnType<typeof axios.create>) {
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
  }

  private decodeState(state: string): string {
    return Buffer.from(state, "base64").toString("utf8");
  }

  async getTokenByCode(code: string, state: string): Promise<ExchangeTokenResponse> {
    const payload: ExchangeTokenRequest = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state),
    };

    const { data } = await this.client.post(EXCHANGE_TOKEN_PATH, payload);
    return data;
  }

  async getUserInfoByToken(token: ExchangeTokenResponse): Promise<GetUserInfoResponse> {
    const { data } = await this.client.post(GET_USER_INFO_PATH, {
      accessToken: token.accessToken,
    });

    return data;
  }
}

const createOAuthHttpClient = (): AxiosInstance =>
  axios.create({
    baseURL: ENV.oAuthServerUrl || "http://localhost:3001",
    timeout: AXIOS_TIMEOUT_MS,
  });

class SDKServer {
  private readonly client: AxiosInstance;
  private readonly oauthService: OAuthService;

  constructor(client: AxiosInstance = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }

  private deriveLoginMethod(platforms: unknown, fallback: string | null | undefined): string | null {
    if (fallback) return fallback;
    if (!Array.isArray(platforms)) return null;

    const set = new Set(platforms.filter((p) => typeof p === "string"));

    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT")) return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";

    return Array.from(set)[0]?.toLowerCase() ?? null;
  }

  async exchangeCodeForToken(code: string, state: string) {
    return this.oauthService.getTokenByCode(code, state);
  }

  async getUserInfo(accessToken: string) {
    const data = await this.oauthService.getUserInfoByToken({ accessToken } as any);

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform,
    );

    return { ...(data as any), platform: loginMethod, loginMethod } as GetUserInfoResponse;
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map();
    return new Map(Object.entries(parseCookieHeader(cookieHeader)));
  }

  private getSessionSecret() {
    return new TextEncoder().encode(ENV.cookieSecret || "default_secret");
  }

  async createSessionToken(openId: string, options: { expiresInMs?: number; name?: string } = {}) {
    return this.signSession(
      { openId, appId: ENV.appId, name: options.name ?? "" },
      options,
    );
  }

  async signSession(payload: SessionPayload, options: { expiresInMs?: number } = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);

    const secret = this.getSessionSecret();

    return new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secret);
  }

  async verifySession(cookieValue: string | undefined | null) {
    if (!cookieValue) return null;

    try {
      const secret = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secret, { algorithms: ["HS256"] });

      const { openId, appId, name } = payload as any;

      if (!openId || !appId || !name) return null;
      return { openId, appId, name };
    } catch {
      return null;
    }
  }

  async getUserInfoWithJwt(jwtToken: string): Promise<GetUserInfoWithJwtResponse> {
    const payload: GetUserInfoWithJwtRequest = {
      jwtToken,
      projectId: ENV.appId,
    };

    const { data } = await this.client.post(GET_USER_INFO_WITH_JWT_PATH, payload);

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform,
    );

    return { ...(data as any), platform: loginMethod, loginMethod };
  }

  async authenticateRequest(req: any): Promise<User> {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);

    const session = await this.verifySession(sessionCookie);
    if (!session) throw ForbiddenError("Invalid session cookie");

    const openId = session.openId;
    const now = new Date();
    let user = await getUserByOpenId(openId);

    if (!user) {
      const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name ?? "",
        email: userInfo.email ?? "",
        loginMethod: userInfo.loginMethod ?? "",
        lastSignedIn: now,
        role: "user",
        password: null,
      });
      user = await getUserByOpenId(openId);
    }

    await upsertUser({
      ...user,
      lastSignedIn: now,
    });

    return user!;
  }
}

export const sdk = new SDKServer();

/* ROUTES */
export function registerOAuthRoutes(app: any) {

  /* ---------------- GOOGLE OAUTH ---------------- */
  app.get("/api/auth/google", async (req: Request, res: Response) => {
    if (!ENV.googleClientId || !ENV.googleCallbackUrl) {
      return res.status(500).json({ error: "Google OAuth not configured" });
    }

    const redirectUri =
      typeof req.query.redirectUri === "string" ? req.query.redirectUri : "/dashboard";

    const state = Buffer.from(
      JSON.stringify({
        redirectUri,
        nameHint: req.query.nameHint,
      }),
    ).toString("base64");

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", ENV.googleClientId);
    url.searchParams.set("redirect_uri", ENV.googleCallbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");

    res.redirect(url.toString());
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const stateRaw = req.query.state as string | undefined;

    if (!code) return res.status(400).json({ error: "Missing code" });

    try {
      const tokenRes = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({
          code,
          client_id: ENV.googleClientId!,
          client_secret: ENV.googleClientSecret!,
          redirect_uri: ENV.googleCallbackUrl!,
          grant_type: "authorization_code",
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      const idToken = tokenRes.data?.id_token;
      if (!idToken) return res.status(400).json({ error: "Missing id_token" });

      const [, payloadPart] = idToken.split(".");
      const payload = JSON.parse(Buffer.from(payloadPart, "base64").toString("utf8"));

      const sub = payload.sub;
      const email = payload.email ?? "";
      const name = payload.name ?? payload.given_name ?? "Google User";

      const openId = `google:${sub}`;

      await upsertUser({
        openId,
        email,
        name,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });

      const redirectData = stateRaw
        ? JSON.parse(Buffer.from(stateRaw, "base64").toString("utf8"))
        : null;

      res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(req));

      res.redirect(redirectData?.redirectUri ?? "/dashboard");
    } catch (error: any) {
      console.error("[OAuth] Google callback error:", error?.response?.data);
      res.status(500).json({ error: "Google auth failed" });
    }
  });

  /* ---------------- DEV LOGIN ---------------- */
  app.get("/api/oauth/dev-login", async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "dev-login disabled" });
    }

    const email = (req.query.email as string) ?? "dev@example.com";
    const name = (req.query.name as string) ?? "Dev User";
    const redirectUri = (req.query.redirectUri as string) ?? "/";

    const openId = `dev:${email}`;

    await upsertUser({
      openId,
      email,
      name,
      loginMethod: "dev",
      lastSignedIn: new Date(),
      role: "user",
    });

    const sessionToken = await sdk.createSessionToken(openId, {
      name,
      expiresInMs: ONE_YEAR_MS,
    });

    res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(req));
    res.redirect(redirectUri);
  });

  /* ---------------- PLANIT PORTAL OAUTH ---------------- */
  app.get("/api/oauth/callback", async (req: any, res: any) => {
    const code = req.query.code;
    const state = req.query.state;

    if (!code || !state) {
      return res.status(400).json({ error: "code and state required" });
    }

    try {
      const tokenRes = await sdk.exchangeCodeForToken(code, state);

      const userInfo = await sdk.getUserInfo(tokenRes.accessToken);

      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name ?? "",
        email: userInfo.email ?? "",
        loginMethod: userInfo.loginMethod ?? "",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name ?? "",
        expiresInMs: ONE_YEAR_MS,
      });

      const redirectTo = Buffer.from(state, "base64").toString("utf8");

      res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(req));
      res.redirect(redirectTo || "/");
    } catch (e) {
      console.error("[OAuth] portal callback error", e);
      res.status(500).json({ error: "internal error" });
    }
  });
}
