"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const express_2 = require("@trpc/server/adapters/express");
const oauth_1 = require("./oauth");
const routers_1 = require("../routers");
const context_1 = require("./context"); // HANYA PAKAI INI — TIDAK ADA setupVite
async function startServer() {
    const app = (0, express_1.default)();
    const server = (0, http_1.createServer)(app);
    // FRONTEND VITE = 5173
    // BACKEND SERVER = 3000
    app.use((0, cors_1.default)({
        origin: "http://localhost:5173",
        credentials: true,
    }));
    app.use(express_1.default.json({ limit: "50mb" }));
    app.use(express_1.default.urlencoded({ limit: "50mb", extended: true }));
    (0, oauth_1.registerOAuthRoutes)(app);
    app.use((0, cookie_parser_1.default)());
    // tRPC API
    app.use("/api/trpc", (0, express_2.createExpressMiddleware)({
        router: routers_1.appRouter,
        createContext: context_1.createContext,
    }));
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
    });
}
startServer().catch(console.error);
