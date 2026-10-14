import { connection } from "next/server";

type ModelType = "default" | "slim";

type Resolved = {
  name: string;
  id: string;
  model: ModelType;
  skin: string;
  cape: string | null;
};

const memory = new Map<string, { at: number; value: Resolved }>();

export async function GET(request: Request) {
  await connection();
  const name = new URL(request.url).searchParams.get("name")?.trim() ?? "";
  if (!/^[a-zA-Z0-9_]{1,16}$/.test(name)) {
    return Response.json({ error: "玩家名是 1–16 位字母、数字或下划线。" }, { status: 400 });
  }

  const key = name.toLowerCase();
  const cached = memory.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
    return Response.json(cached.value);
  }

  try {
    const resolved = await resolvePlayer(name);
    memory.set(key, { at: Date.now(), value: resolved });
    return Response.json(resolved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "皮肤服务暂时没有回应。";
    const status = message.includes("没有这个玩家") ? 404 : message.includes("限流") ? 429 : 502;
    return Response.json({ error: message }, { status });
  }
}

async function resolvePlayer(name: string): Promise<Resolved> {
  const profile = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`, {
    cache: "no-store",
  });
  if (profile.status === 404) throw new Error("没有这个玩家。");
  if (profile.status === 429) throw new Error("Mojang 限流了，等一会儿再查。");
  if (!profile.ok) throw new Error("皮肤服务暂时没有回应。");
  const identity = (await profile.json()) as { id?: string; name?: string };
  if (!identity.id || !identity.name) throw new Error("没有这个玩家。");

  const session = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${identity.id}`, {
    cache: "no-store",
  });
  if (session.status === 429) throw new Error("Mojang 限流了，等一会儿再查。");
  if (!session.ok) throw new Error("皮肤服务暂时没有回应。");
  const body = (await session.json()) as {
    properties?: Array<{ name: string; value: string }>;
  };
  const encoded = body.properties?.find((property) => property.name === "textures")?.value;
  if (!encoded) throw new Error("这个账号没有皮肤数据。");
  const textures = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as {
    textures?: {
      SKIN?: { url?: string; metadata?: { model?: string } };
      CAPE?: { url?: string };
    };
  };
  const skinUrl = textures.textures?.SKIN?.url;
  if (!skinUrl) throw new Error("这个账号没有皮肤。");
  const skin = await readTexture(skinUrl);
  const capeUrl = textures.textures?.CAPE?.url;
  const cape = capeUrl ? await readTexture(capeUrl) : null;
  return {
    name: identity.name,
    id: identity.id,
    model: textures.textures?.SKIN?.metadata?.model === "slim" ? "slim" : "default",
    skin,
    cape,
  };
}

async function readTexture(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("皮肤文件没有下下来。");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > 2_500_000) throw new Error("这张皮肤太大了，换一张 PNG 上传。");
  const type = response.headers.get("content-type")?.includes("png") ? "image/png" : "image/png";
  return `data:${type};base64,${bytes.toString("base64")}`;
}
