type ModelType = "default" | "slim";

type TextureProperty = { name: string; value: string };

type ProfileTextures = {
  textures?: {
    SKIN?: { url?: string; metadata?: { model?: string } };
    CAPE?: { url?: string };
  };
};

export type FetchedPlayer = {
  name: string;
  model: ModelType;
  skin: string;
  cape: string | null;
};

export function isPlayerName(name: string) {
  return /^[a-zA-Z0-9_]{1,16}$/.test(name);
}

/** Download a Java account skin the same way the studio lookup does. */
export async function fetchPlayerSkin(name: string): Promise<FetchedPlayer> {
  const trimmed = name.trim();
  if (!isPlayerName(trimmed)) throw new Error("player name must be 1–16 letters, numbers, or underscores");
  const player = await lookupPlayer(trimmed);
  const encoded = player.properties.find((property) => property.name === "textures")?.value;
  if (!encoded) throw new Error(`no skin data for ${trimmed}`);
  const textures = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as ProfileTextures;
  const skinUrl = textures.textures?.SKIN?.url;
  if (!skinUrl) throw new Error(`no account skin for ${trimmed}`);
  const skin = await readTexture(skinUrl);
  const capeUrl = textures.textures?.CAPE?.url;
  const cape = capeUrl ? await readTexture(capeUrl) : null;
  return {
    name: player.name,
    model: textures.textures?.SKIN?.metadata?.model === "slim" ? "slim" : "default",
    skin,
    cape,
  };
}

async function lookupPlayer(name: string): Promise<{ id: string; name: string; properties: TextureProperty[] }> {
  const profile = await fetch(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(name)}`);
  if (profile.status === 404) throw new Error(`no Minecraft account named ${name}`);
  if (profile.status === 429) throw new Error("skin lookup was rate limited");
  if (profile.ok) {
    const identity = (await profile.json()) as { id?: string; name?: string };
    if (!identity.id || !identity.name) throw new Error(`no Minecraft account named ${name}`);
    const session = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${identity.id}`);
    if (session.status === 429) throw new Error("skin lookup was rate limited");
    if (session.ok) {
      const body = (await session.json()) as { properties?: TextureProperty[] };
      return { id: identity.id, name: identity.name, properties: body.properties ?? [] };
    }
  }
  const alt = await fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(name)}`, {
    headers: { "User-Agent": "pixelstage (tools.xm1221.cn)" },
  });
  if (alt.status === 404 || alt.status === 400) throw new Error(`no Minecraft account named ${name}`);
  if (alt.status === 429) throw new Error("skin lookup was rate limited");
  if (!alt.ok) throw new Error("skin lookup failed");
  const data = (await alt.json()) as {
    data?: { player?: { raw_id?: string; username?: string; properties?: TextureProperty[] } };
  };
  const player = data.data?.player;
  if (!player?.raw_id || !player.username) throw new Error(`no Minecraft account named ${name}`);
  return { id: player.raw_id, name: player.username, properties: player.properties ?? [] };
}

async function readTexture(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol === "http:") parsed.protocol = "https:";
  if (parsed.protocol !== "https:" || parsed.hostname !== "textures.minecraft.net") throw new Error("skin texture host was rejected");
  const response = await fetch(parsed.toString());
  if (!response.ok) throw new Error("skin texture download failed");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > 2_500_000) throw new Error("skin texture is too large");
  return `data:image/png;base64,${bytes.toString("base64")}`;
}
