"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyOwner = notifyOwner;
const server_1 = require("@trpc/server");
const env_1 = require("./env");
const resend_1 = require("resend");
// ----------------------------------
// CONSTANTS
// ----------------------------------
const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;
const trimValue = (value) => value.trim();
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
// ----------------------------------
// URL BUILDING
// ----------------------------------
const buildEndpointUrl = (baseUrl) => {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return new URL("webdevtoken.v1.WebDevService/SendNotification", normalizedBase).toString();
};
// ----------------------------------
// PAYLOAD VALIDATION
// ----------------------------------
const validatePayload = (input) => {
    if (!isNonEmptyString(input.title)) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Notification title is required.",
        });
    }
    if (!isNonEmptyString(input.content)) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Notification content is required.",
        });
    }
    const title = trimValue(input.title);
    const content = trimValue(input.content);
    if (title.length > TITLE_MAX_LENGTH) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: `Title may not exceed ${TITLE_MAX_LENGTH} characters.`,
        });
    }
    if (content.length > CONTENT_MAX_LENGTH) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: `Content may not exceed ${CONTENT_MAX_LENGTH} characters.`,
        });
    }
    return { title, content };
};
// ======================================================================
// 🟦 PRIMARY NOTIFICATION → Forge API
// 🟥 FALLBACK → Email via Resend
// ======================================================================
async function notifyOwner(payload) {
    const { title, content } = validatePayload(payload);
    const forgeConfigured = isNonEmptyString(env_1.ENV.forgeApiUrl) && isNonEmptyString(env_1.ENV.forgeApiKey);
    // 🔵 If Forge is not set, fall back immediately
    if (!forgeConfigured) {
        console.warn("[Notification] Forge not configured — using email fallback.");
        return await sendEmailFallback({ title, content });
    }
    const endpoint = buildEndpointUrl(env_1.ENV.forgeApiUrl);
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                accept: "application/json",
                authorization: `Bearer ${env_1.ENV.forgeApiKey}`,
                "content-type": "application/json",
                "connect-protocol-version": "1",
            },
            body: JSON.stringify({ title, content }),
        });
        if (!response.ok) {
            const errorBody = await response.text().catch(() => "");
            console.warn(`[Notification] Forge API failed (${response.status}):`, errorBody);
            return await sendEmailFallback({ title, content });
        }
        console.log("[Notification] Delivered via Forge.");
        return true;
    }
    catch (error) {
        console.warn("[Notification] Forge error → email fallback:", error);
        return await sendEmailFallback({ title, content });
    }
}
// ======================================================================
// 📧 EMAIL FALLBACK (Resend)
// ======================================================================
async function sendEmailFallback(payload) {
    if (!env_1.ENV.resendApiKey || !env_1.ENV.emailFrom || !env_1.ENV.ownerEmail) {
        console.error("[Email] Resend not configured. Email fallback skipped.");
        return false;
    }
    try {
        const resend = new resend_1.Resend(env_1.ENV.resendApiKey);
        await resend.emails.send({
            from: env_1.ENV.emailFrom,
            to: env_1.ENV.ownerEmail,
            subject: payload.title,
            html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>${escapeHtml(payload.title)}</h2>
          <p>${escapeHtml(payload.content)}</p>
        </div>
      `,
        });
        console.log("[Email] Fallback email sent.");
        return true;
    }
    catch (err) {
        console.error("[Email] Failed to send fallback email:", err);
        return false;
    }
}
// ----------------------------------
// PREVENT HTML INJECTION
// ----------------------------------
const escapeHtml = (str) => str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
