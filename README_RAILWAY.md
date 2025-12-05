Railway deployment guide
=======================

Quick steps to deploy this backend to Railway (recommended flow):

1. Create a new project on Railway and choose "Deploy from GitHub". Connect the repository `kholisiswa/PlanIT_Backend`.

2. Add the PostgreSQL plugin in Railway (Project > Add Plugin > PostgreSQL). Railway will provision credentials and expose a `DATABASE_URL`.

3. In Railway Project Settings > Variables, add the environment variables required by the app. Use values from the `/.env.example` as keys:

   - `DATABASE_URL` (from Railway Postgres plugin)
   - `PORT` (Railway provides this automatically; you can leave it unset)
   - `JWT_SECRET` (generate a secure random value)
   - `RESEND_API_KEY`, `FORGE_API_URL`, `FORGE_API_KEY`, `EMAIL_FROM`, `OWNER_EMAIL`, `OAUTH_SERVER_URL` — fill as needed

4. Configure build & start commands in Railway (if Railway doesn't auto-detect):

   - Build Command: `pnpm build`
   - Start Command: `pnpm start`

   The `Procfile` included in the repo contains `web: pnpm start`, which informs Railway how to run the server.

5. If your app needs migrations or schema generation using `drizzle-kit`, run the commands after the database is provisioned (you can run these from Railway console or a one-off job):

   - `pnpm db:generate`
   - `pnpm db:push`  (ensure `DATABASE_URL` points to the Railway Postgres)

6. Deploy: push to `main` (or the branch Railway watches) and trigger a deployment from the Railway dashboard. Monitor the logs for errors.

Troubleshooting tips
- Ensure `DATABASE_URL` is correct and accessible from Railway.
- If you see TypeScript related errors during start, ensure the `build` step completes successfully (`pnpm build` runs `tsc -p .`).
- Railway exposes `PORT` env var — the app reads `PORT` in `.env` so it will bind to the correct port.

If you want, I can:
- Add a GitHub Action to build/test before deploy, or
- Create a Railway environment setup script, or
- Help run the initial database migrate from my environment (requires you to allow temporary access to Railway credentials).
