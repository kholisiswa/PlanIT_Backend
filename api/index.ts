import "dotenv/config";
import express from "express";           // ← HARUS ADA
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../server/_core/app";

const app = createApp();

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
