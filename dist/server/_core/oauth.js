"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sdk = void 0;
exports.registerOAuthRoutes = registerOAuthRoutes;
const const_1 = require("@shared/const");
const errors_1 = require("@shared/_core/errors");
const axios_1 = __importDefault(require("axios"));
const cookie_1 = require("cookie");
const cookies_1 = require("./cookies");
const jose_1 = require("jose");
const db_1 = require("../db");
const env_1 = require("./env");
const isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
class OAuthService {
    constructor(client) {
        this.client = client;
        console.log("[OAuth] Initialized with baseURL:", env_1.ENV.oAuthServerUrl);
        if (!env_1.ENV.oAuthServerUrl) {
            console.error("[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL in backend .env");
        }
    }
    decodeState(state) {
        return Buffer.from(state, "base64").toString("utf8"); // FIXED: Node tidak punya 'atob'
    }
    async getTokenByCode(code, state) {
        const payload = {
            clientId: env_1.ENV.appId,
            grantType: "authorization_code",
            code,
            redirectUri: this.decodeState(state),
        };
        const { data } = await this.client.post(EXCHANGE_TOKEN_PATH, payload);
        return data;
    }
    async getUserInfoByToken(token) {
        const { data } = await this.client.post(GET_USER_INFO_PATH, {
            accessToken: token.accessToken,
        });
        return data;
    }
}
const createOAuthHttpClient = () => axios_1.default.create({
    baseURL: env_1.ENV.oAuthServerUrl || "http://localhost:3001", // DEFAULT agar tidak undefined
    timeout: const_1.AXIOS_TIMEOUT_MS,
});
class SDKServer {
    constructor(client = createOAuthHttpClient()) {
        this.client = client;
        this.oauthService = new OAuthService(this.client);
    }
    deriveLoginMethod(platforms, fallback) {
        if (fallback && fallback.length > 0)
            return fallback;
        if (!Array.isArray(platforms) || platforms.length === 0)
            return null;
        const set = new Set(platforms.filter((p) => typeof p === "string"));
        if (set.has("REGISTERED_PLATFORM_EMAIL"))
            return "email";
        if (set.has("REGISTERED_PLATFORM_GOOGLE"))
            return "google";
        if (set.has("REGISTERED_PLATFORM_APPLE"))
            return "apple";
        if (set.has("REGISTERED_PLATFORM_MICROSOFT"))
            return "microsoft";
        if (set.has("REGISTERED_PLATFORM_GITHUB"))
            return "github";
        const first = Array.from(set)[0];
        return first ? first.toLowerCase() : null;
    }
    async exchangeCodeForToken(code, state) {
        return this.oauthService.getTokenByCode(code, state);
    }
    async getUserInfo(accessToken) {
        const data = await this.oauthService.getUserInfoByToken({
            accessToken,
        });
        const loginMethod = this.deriveLoginMethod(data?.platforms, data?.platform ?? data.platform ?? null);
        return {
            ...data,
            platform: loginMethod,
            loginMethod,
        };
    }
    parseCookies(cookieHeader) {
        if (!cookieHeader) {
            return new Map();
        }
        const parsed = (0, cookie_1.parse)(cookieHeader);
        return new Map(Object.entries(parsed));
    }
    getSessionSecret() {
        const secret = env_1.ENV.cookieSecret || "default_secret";
        return new TextEncoder().encode(secret);
    }
    async createSessionToken(openId, options = {}) {
        return this.signSession({
            openId,
            appId: env_1.ENV.appId,
            name: options.name || "",
        }, options);
    }
    async signSession(payload, options = {}) {
        const issuedAt = Date.now();
        const expiresInMs = options.expiresInMs ?? const_1.ONE_YEAR_MS;
        const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
        const secretKey = this.getSessionSecret();
        return new jose_1.SignJWT({
            openId: payload.openId,
            appId: payload.appId,
            name: payload.name,
        })
            .setProtectedHeader({ alg: "HS256", typ: "JWT" })
            .setExpirationTime(expirationSeconds)
            .sign(secretKey);
    }
    async verifySession(cookieValue) {
        if (!cookieValue) {
            console.warn("[Auth] Missing session cookie");
            return null;
        }
        try {
            const secretKey = this.getSessionSecret();
            const { payload } = await (0, jose_1.jwtVerify)(cookieValue, secretKey, {
                algorithms: ["HS256"],
            });
            const { openId, appId, name } = payload;
            if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
                console.warn("[Auth] Session payload missing fields");
                return null;
            }
            return { openId, appId, name };
        }
        catch (error) {
            console.warn("[Auth] Session verification failed:", String(error));
            return null;
        }
    }
    async getUserInfoWithJwt(jwtToken) {
        const payload = {
            jwtToken,
            projectId: env_1.ENV.appId,
        };
        const { data } = await this.client.post(GET_USER_INFO_WITH_JWT_PATH, payload);
        const loginMethod = this.deriveLoginMethod(data?.platforms, data?.platform ?? data.platform ?? null);
        return {
            ...data,
            platform: loginMethod,
            loginMethod,
        };
    }
    async authenticateRequest(req) {
        const cookies = this.parseCookies(req.headers.cookie);
        const sessionCookie = cookies.get(const_1.COOKIE_NAME);
        const session = await this.verifySession(sessionCookie);
        if (!session) {
            throw (0, errors_1.ForbiddenError)("Invalid session cookie");
        }
        const sessionUserId = session.openId;
        const signedInAt = new Date();
        let user = await (0, db_1.getUserByOpenId)(sessionUserId);
        if (!user) {
            try {
                const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
                await (0, db_1.upsertUser)({
                    openId: userInfo.openId,
                    name: userInfo.name ?? "",
                    email: userInfo.email ?? "",
                    loginMethod: userInfo.loginMethod ?? userInfo.platform ?? "",
                    lastSignedIn: signedInAt,
                    role: "user",
                    password: null,
                });
                user = await (0, db_1.getUserByOpenId)(userInfo.openId);
            }
            catch (e) {
                console.error("[Auth] Failed to sync user:", e);
                throw (0, errors_1.ForbiddenError)("Failed to sync user info");
            }
        }
        await (0, db_1.upsertUser)({
            openId: user.openId ?? null,
            email: user.email ?? "",
            name: user.name ?? "",
            loginMethod: user.loginMethod ?? "",
            lastSignedIn: signedInAt,
            role: user.role ?? "user",
            password: user.password ?? null,
        });
        return user;
    }
}
exports.sdk = new SDKServer();
function registerOAuthRoutes(app) {
    app.get("/api/oauth/callback", async (req, res) => {
        const code = typeof req.query.code === "string" ? req.query.code : undefined;
        const state = typeof req.query.state === "string" ? req.query.state : undefined;
        if (!code || !state) {
            res.status(400).json({ error: "code and state are required" });
            return;
        }
        try {
            const tokenResponse = await exports.sdk.exchangeCodeForToken(code, state);
            if (!tokenResponse || !tokenResponse.accessToken) {
                console.error("[OAuth] No access token returned from exchangeCodeForToken", { tokenResponse });
                res.status(400).json({ error: "failed to obtain access token" });
                return;
            }
            const userInfo = await exports.sdk.getUserInfo(tokenResponse.accessToken);
            if (!userInfo || !userInfo.openId) {
                console.error("[OAuth] openId missing from user info", { userInfo });
                res.status(400).json({ error: "openId missing from user info" });
                return;
            }
            // Persist user (use empty strings where DB expects non-null strings)
            await (0, db_1.upsertUser)({
                openId: userInfo.openId,
                name: userInfo.name ?? "",
                email: userInfo.email ?? "",
                loginMethod: userInfo.loginMethod ?? userInfo.platform ?? "",
                lastSignedIn: new Date(),
            });
            const sessionToken = await exports.sdk.createSessionToken(userInfo.openId, {
                name: userInfo.name ?? "",
                expiresInMs: const_1.ONE_YEAR_MS,
            });
            // Set cookie and redirect back to the original redirect URI (encoded in state)
            res.cookie(const_1.COOKIE_NAME, sessionToken, (0, cookies_1.getSessionCookieOptions)(req));
            const redirectTo = (() => {
                try {
                    return Buffer.from(state, "base64").toString("utf8");
                }
                catch (e) {
                    return "/";
                }
            })();
            res.redirect(redirectTo || "/");
        }
        catch (e) {
            console.error("[OAuth] callback handler error", e);
            res.status(500).json({ error: "internal error" });
        }
    });
}
