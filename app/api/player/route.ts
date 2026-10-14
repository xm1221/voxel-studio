import { connection } from "next/server";

type ModelType = "default" | "slim";

type Resolved = {
  name: string;
  id: string;
  model: ModelType;
  skin: string;
  cape: string | null;
};

type MemoryHit =
  | { at: number; ok: true; value: Resolved }
  | { at: number; ok: false; status: number; error: string };

const SUCCESS_TTL = 30 * 60 * 1000;
const MISS_TTL = 2 * 60 * 1000;
const memory = new Map<string, MemoryHit>();

const SUCCESS_CACHE = "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400";
const MISS_CACHE = "public, max-age=60, s-maxage=120";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim() ?? "";
  if (!/^[a-zA-Z0-9_]{1,16}$/.test(name)) {
    return Response.json({ error: "玩家名是 1–16 位字母、数字或下划线。" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const key = name.toLowerCase();
  const cacheKey = new Request(new URL(`/api/player?name=${encodeURIComponent(key)}`, url.origin), { method: "GET" });
  const edged = await readEdge(cacheKey);
  if (edged) return edged;

  const cached = readMemory(key);
  if (cached) return cached;

  try {
    const resolved = await resolvePlayer(name);
    memory.set(key, { at: Date.now(), ok: true, value: resolved });
    const response = Response.json(resolved, { headers: { "Cache-Control": SUCCESS_CACHE } });
    await writeEdge(cacheKey, response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "皮肤服务暂时没有回应。";
    const status = message.includes("没有这个玩家") ? 404 : message.includes("限流") ? 429 : 502;
    if (status === 404) memory.set(key, { at: Date.now(), ok: false, status, error: message });
    const cache = status === 404 ? MISS_CACHE : "no-store";
    return Response.json({ error: message }, { status, headers: { "Cache-Control": cache } });
  }
}

function readMemory(key: string) {
  const hit = memory.get(key);
  if (!hit) return null;
  const age = Date.now() - hit.at;
  if (hit.ok) {
    if (age > SUCCESS_TTL) return null;
    return Response.json(hit.value, { headers: { "Cache-Control": SUCCESS_CACHE } });
  }
  if (age > MISS_TTL) return null;
  return Response.json({ error: hit.error }, { status: hit.status, headers: { "Cache-Control": MISS_CACHE } });
}

type EdgeCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

function edgeCache() {
  const storage = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return storage?.default ?? null;
}

async function readEdge(request: Request) {
  try {
    return (await edgeCache()?.match(request)) ?? null;
  } catch {
    return null;
  }
}

async function writeEdge(request: Request, response: Response) {
  try {
    await edgeCache()?.put(request, response.clone());
  } catch {
    // The in-memory map still covers this isolate.
  }
}

type TextureProperty = { name: string; value: string };

type ProfileTextures = {
  textures?: {
    SKIN?: { url?: string; metadata?: { model?: string } };
    CAPE?: { url?: string };
  };
};

/** Workers' fetch cache. Node's fetch ignores this field. */
type EdgeCachedInit = RequestInit & {
  cf?: { cacheTtl: number; cacheEverything: true };
};

const UPSTREAM_TTL = 1800;

function edgeCached(): EdgeCachedInit {
  return { cf: { cacheTtl: UPSTREAM_TTL, cacheEverything: true } };
}

async function resolvePlayer(name: string): Promise<Resolved> {
  const player = await lookupPlayer(name);
  const encoded = player.properties.find((property) => property.name === "textures")?.value;
  if (!encoded) throw new Error("这个账号没有皮肤数据。");
  const textures = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as ProfileTextures;
  const skinUrl = textures.textures?.SKIN?.url;
  if (!skinUrl) throw new Error("这个账号没有皮肤。");
  const skin = await readTexture(skinUrl);
  const capeUrl = textures.textures?.CAPE?.url;
  const cape = capeUrl ? await readTexture(capeUrl) : null;
  return {
    name: player.name,
    id: player.id,
    model: textures.textures?.SKIN?.metadata?.model === "slim" ? "slim" : "default",
    skin,
    cape,
  };
}

async function lookupPlayer(name: string): Promise<{ id: string; name: string; properties: TextureProperty[] }> {
  const profile = await fetch(
    `https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(name)}`,
    edgeCached(),
  );
  if (profile.status === 404) throw new Error("没有这个玩家。");
  if (profile.status === 429) throw new Error("Mojang 限流了，等一会儿再查。");
  if (profile.ok) {
    const identity = (await profile.json()) as { id?: string; name?: string };
    const id = identity.id;
    const foundName = identity.name;
    if (!id || !foundName) throw new Error("没有这个玩家。");
    const session = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`, edgeCached());
    if (session.status === 429) throw new Error("Mojang 限流了，等一会儿再查。");
    if (!session.ok) return lookupPlayerDb(name, { id, name: foundName });
    const body = (await session.json()) as { properties?: TextureProperty[] };
    return { id, name: foundName, properties: body.properties ?? [] };
  }
  // Workers are often answered with 403. playerdb still has the same texture blob.
  return lookupPlayerDb(name);
}

async function lookupPlayerDb(name: string, known?: { id: string; name: string }) {
  const alt = await fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(name)}`, {
    ...edgeCached(),
    headers: { "User-Agent": "pixelstage (tools.xm1221.cn)" },
  });
  if (alt.status === 404 || alt.status === 400) throw new Error("没有这个玩家。");
  if (alt.status === 429) throw new Error("Mojang 限流了，等一会儿再查。");
  if (!alt.ok) throw new Error("皮肤服务暂时没有回应。");
  const data = (await alt.json()) as {
    data?: { player?: { raw_id?: string; username?: string; properties?: TextureProperty[] } };
  };
  const player = data.data?.player;
  const id = known?.id ?? player?.raw_id;
  const foundName = known?.name ?? player?.username;
  if (!id || !foundName) throw new Error("没有这个玩家。");
  return { id, name: foundName, properties: player?.properties ?? [] };
}

async function readTexture(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol === "http:") parsed.protocol = "https:";
  if (parsed.protocol !== "https:" || parsed.hostname !== "textures.minecraft.net") {
    throw new Error("皮肤文件没有下下来。");
  }
  const response = await fetch(parsed.toString(), edgeCached());
  if (!response.ok) throw new Error("皮肤文件没有下下来。");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > 2_500_000) throw new Error("这张皮肤太大了，换一张 PNG 上传。");
  return `data:image/png;base64,${bytes.toString("base64")}`;
}
