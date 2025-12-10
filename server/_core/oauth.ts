import { AXIOS_TIMEOUT_MS, COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
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

    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL in backend .env"
      );
    }
  }

  private decodeState(state: string): string {
    return Buffer.from(state, "base64").toString("utf8"); // FIXED: Node tidak punya 'atob'
  }

  async getTokenByCode(code: string, state: string): Promise<ExchangeTokenResponse> {
    const payload: ExchangeTokenRequest = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state),
    };

    const { data } = await this.client.post<ExchangeTokenResponse>(EXCHANGE_TOKEN_PATH, payload);
    return data;
  }

  async getUserInfoByToken(token: ExchangeTokenResponse): Promise<GetUserInfoResponse> {
    const { data } = await this.client.post<GetUserInfoResponse>(GET_USER_INFO_PATH, {
      accessToken: token.accessToken,
    });

    return data;
  }
}

const createOAuthHttpClient = (): AxiosInstance =>
  axios.create({
    baseURL: ENV.oAuthServerUrl || "http://localhost:3001", // DEFAULT agar tidak undefined
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
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set<string>(platforms.filter((p): p is string => typeof p === "string"));
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT")) return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }

  async exchangeCodeForToken(code: string, state: string): Promise<ExchangeTokenResponse> {
    return this.oauthService.getTokenByCode(code, state);
  }

  async getUserInfo(accessToken: string): Promise<GetUserInfoResponse> {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken,
    } as ExchangeTokenResponse);

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );

    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoResponse;
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret || "default_secret";
    return new TextEncoder().encode(secret);
  }

  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || "",
      },
      options
    );
  }

  async signSession(payload: SessionPayload, options: { expiresInMs?: number } = {}): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(cookieValue: string | undefined | null) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });

      const { openId, appId, name } = payload as any;

      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing fields");
        return null;
      }

      return { openId, appId, name };
    } catch (error) {
      console.warn("[Auth] Session verification failed:", String(error));
      return null;
    }
  }

  async getUserInfoWithJwt(jwtToken: string): Promise<GetUserInfoWithJwtResponse> {
    const payload: GetUserInfoWithJwtRequest = {
      jwtToken,
      projectId: ENV.appId,
    };

    const { data } = await this.client.post<GetUserInfoWithJwtResponse>(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );

    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoWithJwtResponse;
  }

  async authenticateRequest(req: any): Promise<User> {
    const cookies = this.parseCookies(req?.headers?.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const sessionUserId = session.openId;
    const signedInAt = new Date();
    let user = await getUserByOpenId(sessionUserId);

    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");

        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name ?? "",
          email: userInfo.email ?? "",
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? "",
          lastSignedIn: signedInAt,
          role: "user",
          password: null,
        });

        user = await getUserByOpenId(userInfo.openId);
      } catch (e) {
        console.error("[Auth] Failed to sync user:", e);
        throw ForbiddenError("Failed to sync user info");
      }
    }

    await upsertUser({
      openId: user.openId ?? null,
      email: user.email ?? "",
      name: user.name ?? "",
      loginMethod: user.loginMethod ?? "",
      lastSignedIn: signedInAt,
      role: user.role ?? "user",
      password: (user as any).password ?? null,
    });

    return user;
  }
}

export const sdk = new SDKServer();

export function registerOAuthRoutes(app: any) {
  // Google OAuth start
  app.get("/api/auth/google", async (req: Request, res: Response) => {
    if (!ENV.googleClientId || !ENV.googleCallbackUrl) {
      return res.status(500).json({ error: "Google OAuth env not configured" });
    }

    const redirectUri =
      typeof req.query.redirectUri === "string" && req.query.redirectUri.length > 0
        ? req.query.redirectUri
        : `${req.protocol}://${req.get("host")}/dashboard`;

    const emailHint =
      typeof req.query.emailHint === "string" && req.query.emailHint.length > 0
        ? req.query.emailHint
        : undefined;
    const nameHint =
      typeof req.query.nameHint === "string" && req.query.nameHint.length > 0
        ? req.query.nameHint
        : undefined;

    const state = Buffer.from(
      JSON.stringify({
        redirectUri,
        nameHint,
      })
    ).toString("base64");

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", ENV.googleClientId);
    url.searchParams.set("redirect_uri", ENV.googleCallbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    url.searchParams.set("access_type", "offline");
    if (emailHint) url.searchParams.set("login_hint", emailHint);

    res.redirect(url.toString());
  });

  // Google OAuth callback
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const stateRaw = typeof req.query.state === "string" ? req.query.state : null;

    if (!code) {
      return res.status(400).json({ error: "Missing code" });
    }
    if (!ENV.googleClientId || !ENV.googleClientSecret || !ENV.googleCallbackUrl) {
      return res.status(500).json({ error: "Google OAuth env not configured" });
    }

    try {
      const tokenRes = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({
          code,
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          redirect_uri: ENV.googleCallbackUrl,
          grant_type: "authorization_code",
        }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );

      const { id_token: idToken, access_token: accessToken } = tokenRes.data || {};
      if (!idToken) {
        return res.status(400).json({ error: "Missing id_token from Google" });
      }

      const [, payloadPart] = (idToken as string).split(".");
      const payload = JSON.parse(Buffer.from(payloadPart, "base64").toString("utf8"));
      const sub = payload.sub as string | undefined;
      const email = (payload.email as string | undefined) ?? "";
      const name = (payload.name as string | undefined) ?? payload.given_name ?? "Google User";

      if (!sub) {
        return res.status(400).json({ error: "Google response missing sub" });
      }

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

      const redirectData = (() => {
        if (!stateRaw) return null;
        try {
          return JSON.parse(Buffer.from(stateRaw, "base64").toString("utf8"));
        } catch {
          return null;
        }
      })();

      const redirectTo =
        (redirectData?.redirectUri as string | undefined) ||
        `${req.protocol}://${req.get("host")}/dashboard`;

      res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(req));
      res.redirect(redirectTo);
    } catch (error) {
      const anyErr: any = error;
      console.error("[OAuth] Google callback error", {
        message: anyErr?.message,
        response: anyErr?.response?.data,
        status: anyErr?.response?.status,
      });

      if (!ENV.isProduction) {
        return res.status(500).json({
          error: "Google auth failed",
          detail: anyErr?.response?.data ?? anyErr?.message ?? "unknown error",
        });
      }

      res.status(500).json({ error: "Google auth failed" });
    }
  });

  // Dev-only fast login (bypasses external OAuth portal)
  app.get("/api/oauth/dev-login", async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "dev login disabled in production" });
    }

    const email =
      typeof req.query.email === "string" && req.query.email.length > 0
        ? req.query.email
        : "dev@example.com";
    const name =
      typeof req.query.name === "string" && req.query.name.length > 0
        ? req.query.name
        : "Dev User";
    const redirectUri =
      typeof req.query.redirectUri === "string" && req.query.redirectUri.length > 0
        ? req.query.redirectUri
        : "/";

    try {
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
    } catch (error) {
      console.error("[OAuth] dev-login error", error);
      res.status(500).json({ error: "failed to create dev session" });
    }
  });

  app.get("/api/oauth/callback", async (req: any, res: any) => {
    const code = typeof req?.query?.code === "string" ? req.query.code : undefined;
    const state = typeof req?.query?.state === "string" ? req.query.state : undefined;

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);

      if (!tokenResponse || !tokenResponse.accessToken) {
        console.error("[OAuth] No access token returned from exchangeCodeForToken", { tokenResponse });
        res.status(400).json({ error: "failed to obtain access token" });
        return;
      }

      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo || !userInfo.openId) {
        console.error("[OAuth] openId missing from user info", { userInfo });
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      // Persist user (use empty strings where DB expects non-null strings)
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name ?? "",
        email: userInfo.email ?? "",
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? "",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name ?? "",
        expiresInMs: ONE_YEAR_MS,
      });

      // Set cookie and redirect back to the original redirect URI (encoded in state)
      res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(req));
      const redirectTo = (() => {
        try {
          return Buffer.from(state, "base64").toString("utf8");
        } catch (e) {
          return "/";
        }
      })();

      res.redirect(redirectTo || "/");
    } catch (e) {
      console.error("[OAuth] callback handler error", e);
      res.status(500).json({ error: "internal error" });
    }
  });
}
