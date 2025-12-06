"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
// _core/email.ts
const resend_1 = require("resend");
const resend = new resend_1.Resend(process.env.RESEND_API_KEY || "");
/**
 * Mengirim email ke user login
 */
async function sendEmail(to, subject, html) {
    if (!process.env.RESEND_API_KEY) {
        console.error("[Email] RESEND_API_KEY belum diset.");
        return false;
    }
    try {
        await resend.emails.send({
            from: process.env.EMAIL_FROM || "noreply@example.com",
            to,
            subject,
            html,
        });
        console.log("[Email] terkirim ke:", to);
        return true;
    }
    catch (err) {
        console.error("[Email] gagal mengirim:", err);
        return false;
    }
}
