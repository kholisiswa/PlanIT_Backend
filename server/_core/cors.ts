const DEFAULT_ORIGINS = "http://localhost:5173,https://plan-it-frontend-gamma.vercel.app,https://plan-it-frontend-i7uhk89dx-kholis-projects-c2a1ceee.vercel.app,https://plan-it-frontend-git-main-kholis-projects-c2a1ceee.vercel.app,https://plan-it-frontend-ielvuocq9-kholis-projects-c2a1ceee.vercel.app";

export const allowedOrigins = (process.env.CORS_ORIGINS ?? DEFAULT_ORIGINS)
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

export function isOriginAllowed(origin?: string | null) {
  if (!origin) return true;

  return allowedOrigins.some(allowed => {
    if (allowed.endsWith("*")) {
      return origin.startsWith(allowed.slice(0, -1));
    }
    return origin === allowed;
  });
}

export function isRedirectUriAllowed(uri?: string | null) {
  if (!uri) return false;

  try {
    const parsed = new URL(uri);
    return isOriginAllowed(parsed.origin);
  } catch (err) {
    console.warn("[CORS] Invalid redirect URI:", uri, err);
    return false;
  }
}
