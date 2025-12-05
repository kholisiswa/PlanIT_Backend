// _core/email.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "");

/**
 * Mengirim email ke user login
 */
export async function sendEmail(to: string, subject: string, html: string) {
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
  } catch (err) {
    console.error("[Email] gagal mengirim:", err);
    return false;
  }
}
