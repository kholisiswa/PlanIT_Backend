// Root entry (for Vercel Express preset) — reuses the same app as /api/index.ts
import { createApp } from "./server/_core/app";

const app = createApp();

export default app;
