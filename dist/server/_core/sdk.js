"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sdk = void 0;
const const_1 = require("@shared/const");
const errors_1 = require("@shared/_core/errors");
const axios_1 = __importDefault(require("axios"));
const cookie_1 = require("cookie");
const jose_1 = require("jose");
const db_1 = require("../db");
const env_1 = require("./env");
// Utility function
const isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
class OAuthService {
    constructor(client) {
        this.client = client;
        console.log("[OAuth] Initialized with baseURL:", env_1.ENV.oAuthServerUrl);
        if (!env_1.ENV.oAuthServerUrl) {
            console.error("[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable.");
        }
    }
    decodeState(state) {
        const redirectUri = atob(state);
        return redirectUri;
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
    baseURL: env_1.ENV.oAuthServerUrl,
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
        if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
            return "microsoft";
        if (set.has("REGISTERED_PLATFORM_GITHUB"))
            return "github";
        const first = Array.from(set)[0];
        return first ? first.toLowerCase() : null;
    }
    /**
     * Exchange OAuth authorization code for access token
     * @example
     * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
     */
    async exchangeCodeForToken(code, state) {
        return this.oauthService.getTokenByCode(code, state);
    }
    /**
     * Get user information using access token
     * @example
     * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
     */
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
        const secret = env_1.ENV.cookieSecret;
        return new TextEncoder().encode(secret);
    }
    /**
     * Create a session token for a Manus user openId
     * @example
     * const sessionToken = await sdk.createSessionToken(userInfo.openId);
     */
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
                console.warn("[Auth] Session payload missing required fields");
                return null;
            }
            return {
                openId,
                appId,
                name,
            };
        }
        catch (error) {
            console.warn("[Auth] Session verification failed", String(error));
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
        let user = await (0, db_1.getUserByOpenId)(sessionUserId); // ← ganti db. jadi langsung
        if (!user) {
            try {
                const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
                // ensure required fields are non-nullable for DB upsert (email is required in schema)
                await (0, db_1.upsertUser)({
                    openId: userInfo.openId,
                    name: userInfo.name ?? "",
                    email: userInfo.email ?? "",
                    loginMethod: userInfo.loginMethod ?? userInfo.platform ?? "",
                    lastSignedIn: signedInAt,
                    role: "user",
                    password: null,
                });
                user = await (0, db_1.getUserByOpenId)(userInfo.openId); // ← langsung panggil
            }
            catch (error) {
                console.error("[Auth] Failed to sync user from OAuth:", error);
                throw (0, errors_1.ForbiddenError)("Failed to sync user info");
            }
        }
        if (!user) {
            throw (0, errors_1.ForbiddenError)("User not found");
        }
        // When updating lastSignedIn for an existing user, include required fields (email is required)
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
