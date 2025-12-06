"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const routers_1 = require("./routers");
const const_1 = require("../shared/const");
function createAuthContext() {
    const clearedCookies = [];
    const user = {
        id: 1,
        openId: "sample-user",
        email: "sample@example.com",
        name: "Sample User",
        loginMethod: "google",
        role: "user",
        password: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
    };
    const ctx = {
        user,
        db: {},
        req: {
            protocol: "https",
            headers: {},
        },
        res: {
            clearCookie: (name, options) => {
                clearedCookies.push({ name, options });
            },
        },
    };
    return { ctx, clearedCookies };
}
(0, vitest_1.describe)("auth.logout", () => {
    (0, vitest_1.it)("clears the session cookie and reports success", async () => {
        const { ctx, clearedCookies } = createAuthContext();
        const caller = routers_1.appRouter.createCaller(ctx);
        const result = await caller.auth.logout();
        (0, vitest_1.expect)(result).toEqual({ success: true });
        (0, vitest_1.expect)(clearedCookies).toHaveLength(1);
        (0, vitest_1.expect)(clearedCookies[0]?.name).toBe(const_1.COOKIE_NAME);
        (0, vitest_1.expect)(clearedCookies[0]?.options).toMatchObject({
            maxAge: -1,
            secure: true,
            sameSite: "none",
            httpOnly: true,
            path: "/",
        });
    });
});
