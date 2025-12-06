// Vercel Serverless entrypoint for the Express + tRPC backend
import "dotenv/config";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../server/_core/app";

// Re-use a single app instance across invocations
const app = createApp();

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
