import type { NextConfig } from "next";
import { publicBasePath } from "./lib/paths";

/**
 * The live site is https://tools.xm1221.cn/mcrender.
 * A production build that omits this prefix 404s. `.env.production` and
 * `npm run deploy:cf` set NEXT_PUBLIC_BASE_PATH; this fallback covers a
 * build that forgot both. Set NEXT_PUBLIC_BASE_PATH to empty to force `/`.
 */
function resolveBasePath() {
  if (process.env.NEXT_PUBLIC_BASE_PATH !== undefined) return publicBasePath();
  return process.env.NODE_ENV === "production" ? "/mcrender" : "";
}

const basePath = resolveBasePath();

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
