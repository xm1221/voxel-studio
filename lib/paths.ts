/** Prefix for hosting under a sub-path, for example `/mcrender`. Empty during local dev. */
export function publicBasePath() {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
  if (!raw || raw === "/") return "";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/$/, "");
}

/** Prefix an app-internal path (`/api/player`) with the configured base path. */
export function withBasePath(path: string) {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${publicBasePath()}${suffix}`;
}
