export type EntityCategory = "passive" | "hostile" | "ambient";

export type EntityBox = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  u: number;
  v: number;
  mirror?: boolean;
  inflate?: number;
  cutout?: boolean;
  texture?: string;
  /** Degrees around the box center. */
  spin?: { x?: number; y?: number; z?: number };
};

export type EntityDef = {
  id: string;
  category: EntityCategory;
  texture: string;
  texW: number;
  texH: number;
  crop: [number, number, number, number];
  boxes: EntityBox[];
};

type Sheet = { texW: number; texH: number };

function part(sheet: Sheet, x: number, y: number, z: number, w: number, h: number, d: number, u: number, v: number, extra?: Partial<EntityBox>): EntityBox {
  return { x, y, z, w, h, d, u, v, ...extra, ...sheet };
}

function humanoid(id: string, texture: string, sheet: Sheet, category: EntityCategory, options?: { overlay?: boolean; thin?: boolean; tall?: boolean }): EntityDef {
  const { texW, texH } = sheet;
  const thin = options?.thin;
  const tall = options?.tall;
  const armW = thin ? 2 : 4;
  const legW = thin ? 2 : 4;
  const bodyY = tall ? 32 : 18;
  const headY = tall ? 42 : 28;
  const armY = tall ? 21 : 18;
  const legY = tall ? 15 : 6;
  const armH = tall ? 30 : 12;
  const legH = tall ? 30 : 12;
  const armX = thin ? 5 : 6;
  const boxes: EntityBox[] = [
    part(sheet, 0, headY, 0, 8, 8, 8, 0, 0),
    part(sheet, 0, bodyY, 0, 8, 12, 4, texH === 32 && thin ? 32 : 16, thin ? 16 : 16),
    part(sheet, -armX, armY, 0, armW, armH, armW, thin ? 56 : 40, 0),
    part(sheet, armX, armY, 0, armW, armH, armW, thin ? 56 : texH === 64 ? 32 : 40, thin ? 0 : texH === 64 ? 48 : 16, { mirror: thin || texH === 32 }),
    part(sheet, -2, legY, 0, legW, legH, legW, thin ? 56 : 0, thin ? 0 : 16),
    part(sheet, 2, legY, 0, legW, legH, legW, thin ? 56 : texH === 64 ? 16 : 0, thin ? 0 : texH === 64 ? 48 : 16, { mirror: thin || texH === 32 }),
  ];
  if (options?.overlay && texH === 64) {
    const inflate = 0.4;
    boxes.push(
      part(sheet, 0, headY, 0, 8, 8, 8, 32, 0, { inflate, cutout: true }),
      part(sheet, 0, bodyY, 0, 8, 12, 4, 16, 32, { inflate, cutout: true }),
      part(sheet, -armX, armY, 0, armW, armH, armW, 40, 32, { inflate, cutout: true }),
      part(sheet, armX, armY, 0, armW, armH, armW, 48, 48, { inflate, cutout: true }),
      part(sheet, -2, legY, 0, legW, legH, legW, 0, 32, { inflate, cutout: true }),
      part(sheet, 2, legY, 0, legW, legH, legW, 0, 48, { inflate, cutout: true }),
    );
  }
  return { id, category, texture, texW, texH, crop: [0, 0, 8, 8], boxes };
}

function quadruped(
  id: string,
  texture: string,
  sheet: Sheet,
  category: EntityCategory,
  size: { body: [number, number, number]; head: [number, number, number]; leg: [number, number]; nose?: [number, number, number] },
  uv: { body: [number, number]; head: [number, number]; leg: [number, number]; nose?: [number, number] },
  extra: EntityBox[] = [],
): EntityDef {
  const [bw, bh, bd] = size.body;
  const [hw, hh, hd] = size.head;
  const [lw, lh] = size.leg;
  const legY = lh / 2;
  const bodyY = lh + bh / 2 - 1;
  const headZ = bd / 2 + hd / 2 - 1;
  const boxes: EntityBox[] = [
    part(sheet, 0, bodyY, 0, bw, bd, bh, uv.body[0], uv.body[1], { spin: { x: 90 } }),
    part(sheet, 0, bodyY + 4, headZ, hw, hh, hd, uv.head[0], uv.head[1]),
    part(sheet, -bw / 2 + lw / 2, legY, bd / 2 - lw, lw, lh, lw, uv.leg[0], uv.leg[1]),
    part(sheet, bw / 2 - lw / 2, legY, bd / 2 - lw, lw, lh, lw, uv.leg[0], uv.leg[1]),
    part(sheet, -bw / 2 + lw / 2, legY, -bd / 2 + lw, lw, lh, lw, uv.leg[0], uv.leg[1]),
    part(sheet, bw / 2 - lw / 2, legY, -bd / 2 + lw, lw, lh, lw, uv.leg[0], uv.leg[1]),
    ...extra.map((box) => ({ ...sheet, ...box })),
  ];
  if (size.nose && uv.nose) {
    boxes.push(part(sheet, 0, bodyY + 2, headZ + hd / 2, size.nose[0], size.nose[1], size.nose[2], uv.nose[0], uv.nose[1]));
  }
  return { id, category, texture, texW: sheet.texW, texH: sheet.texH, crop: [uv.head[0], uv.head[1], hw, hh], boxes };
}

const S64 = { texW: 64, texH: 64 };
const S32 = { texW: 64, texH: 32 };

const creeper: EntityDef = {
  id: "creeper",
  category: "hostile",
  texture: "entity/creeper.png",
  texW: 64,
  texH: 32,
  crop: [0, 0, 8, 8],
  boxes: [
    part(S32, 0, 22, 0, 8, 8, 8, 0, 0),
    part(S32, 0, 12, 0, 8, 12, 4, 16, 16),
    part(S32, -2, 3, -2, 4, 6, 4, 0, 16),
    part(S32, 2, 3, -2, 4, 6, 4, 0, 16),
    part(S32, -2, 3, 2, 4, 6, 4, 0, 16),
    part(S32, 2, 3, 2, 4, 6, 4, 0, 16),
  ],
};

const chicken: EntityDef = {
  id: "chicken",
  category: "passive",
  texture: "entity/chicken.png",
  texW: 64,
  texH: 32,
  crop: [0, 0, 4, 6],
  boxes: [
    part(S32, 0, 8, 0, 6, 8, 6, 0, 9, { spin: { x: 90 } }),
    part(S32, 0, 13, 4, 4, 6, 3, 0, 0),
    part(S32, 0, 11, 6.2, 4, 2, 2, 14, 0),
    part(S32, 0, 9.2, 5.6, 2, 2, 2, 14, 4),
    part(S32, -1.5, 2.5, 0, 3, 5, 3, 26, 0),
    part(S32, 1.5, 2.5, 0, 3, 5, 3, 26, 0),
    part(S32, -3.2, 9, 0, 1, 4, 6, 24, 13),
    part(S32, 3.2, 9, 0, 1, 4, 6, 24, 13),
  ],
};

const slime = (id: string, texture: string): EntityDef => ({
  id,
  category: "hostile",
  texture,
  texW: 64,
  texH: 32,
  crop: [0, 16, 6, 6],
  boxes: [
    part(S32, 0, 4, 0, 8, 8, 8, 0, 0, { cutout: true, inflate: 0.2 }),
    part(S32, 0, 5, 0, 6, 6, 6, 0, 16),
  ],
});

function spider(id: string, texture: string): EntityDef {
  const legs: EntityBox[] = [];
  const angles = [-55, -20, 20, 55];
  angles.forEach((yaw, index) => {
    const z = -6 + index * 4;
    legs.push(part(S32, -10, 6, z, 16, 2, 2, 18, 0, { spin: { y: yaw, z: 35 } }));
    legs.push(part(S32, 10, 6, z, 16, 2, 2, 18, 0, { spin: { y: -yaw, z: -35 }, mirror: true }));
  });
  return {
    id,
    category: "hostile",
    texture,
    texW: 64,
    texH: 32,
    crop: [32, 4, 8, 8],
    boxes: [
      part(S32, 0, 8, 0, 6, 6, 6, 0, 0),
      part(S32, 0, 8, 9, 10, 8, 12, 0, 12),
      part(S32, 0, 9, -6, 8, 8, 8, 32, 4),
      ...legs,
    ],
  };
}

const ghast = (id: string, texture: string, category: EntityCategory): EntityDef => ({
  id,
  category,
  texture,
  texW: texture.includes("happy") ? 64 : 64,
  texH: 32,
  crop: [16, 16, 16, 16],
  boxes: [part({ texW: 64, texH: 32 }, 0, 20, 0, 16, 16, 16, 0, 0)],
});

const blaze: EntityDef = {
  id: "blaze",
  category: "hostile",
  texture: "entity/blaze/blaze.png",
  texW: 64,
  texH: 32,
  crop: [0, 0, 8, 8],
  boxes: [
    part(S32, 0, 28, 0, 8, 8, 8, 0, 0),
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((yaw, index) =>
      part(S32, Math.cos((yaw * Math.PI) / 180) * 7, 14 + (index % 3) * 6, Math.sin((yaw * Math.PI) / 180) * 7, 2, 8, 2, 0, 16),
    ),
  ],
};

const squid = (id: string, texture: string): EntityDef => ({
  id,
  category: "ambient",
  texture,
  texW: 64,
  texH: 32,
  crop: [0, 0, 12, 16],
  boxes: [
    part(S32, 0, 14, 0, 12, 16, 12, 0, 0),
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((yaw) =>
      part(S32, Math.cos((yaw * Math.PI) / 180) * 6, 6, Math.sin((yaw * Math.PI) / 180) * 6, 2, 12, 2, 48, 0),
    ),
  ],
});

function villager(id: string, texture: string, category: EntityCategory, hat = false): EntityDef {
  const boxes: EntityBox[] = [
    part(S64, 0, 28, 0, 8, 10, 8, 0, 0),
    part(S64, 0, 25, 5, 2, 4, 2, 24, 0),
    part(S64, 0, 16, 0, 8, 12, 6, 16, 20),
    part(S64, 0, 16, -3, 12, 4, 4, 40, 38),
    part(S64, -2, 6, 0, 4, 12, 4, 0, 22),
    part(S64, 2, 6, 0, 4, 12, 4, 0, 22, { mirror: true }),
  ];
  if (hat) boxes.push(part(S64, 0, 34, 0, 10, 2, 10, 0, 64 - 10, { inflate: 0 }));
  return { id, category, texture, texW: 64, texH: 64, crop: [0, 0, 8, 8], boxes };
}

const ironGolem: EntityDef = {
  id: "iron_golem",
  category: "passive",
  texture: "entity/iron_golem/iron_golem.png",
  texW: 128,
  texH: 128,
  crop: [0, 0, 8, 10],
  boxes: [
    part({ texW: 128, texH: 128 }, 0, 38, -2, 8, 10, 8, 0, 0),
    part({ texW: 128, texH: 128 }, 0, 36, 4, 2, 4, 2, 24, 0),
    part({ texW: 128, texH: 128 }, 0, 26, 0, 18, 12, 11, 0, 40),
    part({ texW: 128, texH: 128 }, -11, 22, 0, 4, 30, 6, 60, 21),
    part({ texW: 128, texH: 128 }, 11, 22, 0, 4, 30, 6, 60, 21, { mirror: true }),
    part({ texW: 128, texH: 128 }, -4, 8, 0, 6, 16, 5, 37, 0),
    part({ texW: 128, texH: 128 }, 4, 8, 0, 6, 16, 5, 60, 0, { mirror: true }),
  ],
};

const bat: EntityDef = {
  id: "bat",
  category: "ambient",
  texture: "entity/bat/bat.png",
  texW: 32,
  texH: 32,
  crop: [0, 0, 6, 6],
  boxes: [
    part({ texW: 32, texH: 32 }, 0, 8, 0, 6, 6, 6, 0, 0),
    part({ texW: 32, texH: 32 }, -5, 8, 0, 8, 1, 6, 10, 0, { spin: { z: 20 } }),
    part({ texW: 32, texH: 32 }, 5, 8, 0, 8, 1, 6, 10, 0, { spin: { z: -20 }, mirror: true }),
  ],
};

const shulker: EntityDef = {
  id: "shulker",
  category: "hostile",
  texture: "entity/shulker/shulker.png",
  texW: 64,
  texH: 64,
  crop: [0, 0, 16, 12],
  boxes: [
    part(S64, 0, 6, 0, 12, 12, 12, 0, 16),
    part(S64, 0, 14, 0, 12, 8, 12, 0, 0),
  ],
};

const allay: EntityDef = {
  id: "allay",
  category: "passive",
  texture: "entity/allay/allay.png",
  texW: 32,
  texH: 32,
  crop: [0, 0, 6, 6],
  boxes: [
    part({ texW: 32, texH: 32 }, 0, 10, 0, 4, 6, 3, 0, 8),
    part({ texW: 32, texH: 32 }, 0, 16, 0, 6, 6, 6, 0, 0),
    part({ texW: 32, texH: 32 }, -4, 12, 0, 6, 1, 4, 16, 0),
    part({ texW: 32, texH: 32 }, 4, 12, 0, 6, 1, 4, 16, 0, { mirror: true }),
  ],
};

const vex: EntityDef = {
  id: "vex",
  category: "hostile",
  texture: "entity/illager/vex.png",
  texW: 64,
  texH: 64,
  crop: [0, 0, 8, 8],
  boxes: [
    ...humanoid("vex", "entity/illager/vex.png", S64, "hostile").boxes.map((box) => ({ ...box, y: box.y * 0.55 + 2, x: box.x * 0.7, w: box.w * 0.7, h: box.h * 0.55, d: box.d * 0.7 })),
    part(S64, -6, 12, 1, 8, 1, 4, 0, 32, { spin: { z: 25 } }),
    part(S64, 6, 12, 1, 8, 1, 4, 0, 32, { spin: { z: -25 }, mirror: true }),
  ],
};

const phantom: EntityDef = {
  id: "phantom",
  category: "hostile",
  texture: "entity/phantom/phantom.png",
  texW: 64,
  texH: 64,
  crop: [0, 0, 8, 8],
  boxes: [
    part(S64, 0, 10, 0, 8, 4, 16, 0, 8),
    part(S64, 0, 16, 6, 6, 6, 6, 0, 0),
    part(S64, -10, 12, -2, 12, 1, 14, 0, 16, { spin: { z: 12 } }),
    part(S64, 10, 12, -2, 12, 1, 14, 0, 16, { spin: { z: -12 }, mirror: true }),
    part(S64, 0, 6, 8, 2, 8, 2, 16, 16),
  ],
};

const bee: EntityDef = {
  id: "bee",
  category: "passive",
  texture: "entity/bee/bee.png",
  texW: 64,
  texH: 64,
  crop: [0, 0, 8, 7],
  boxes: [
    part(S64, 0, 8, 0, 8, 7, 10, 0, 8),
    part(S64, -2, 10, 6, 3, 2, 1, 2, 0),
    part(S64, 2, 10, 6, 3, 2, 1, 2, 3),
    part(S64, -5, 10, 0, 6, 1, 4, 0, 18, { spin: { z: 20 } }),
    part(S64, 5, 10, 0, 6, 1, 4, 0, 18, { spin: { z: -20 }, mirror: true }),
  ],
};

const axolotl: EntityDef = {
  id: "axolotl",
  category: "passive",
  texture: "entity/axolotl/axolotl_lucy.png",
  texW: 64,
  texH: 64,
  crop: [0, 0, 8, 5],
  boxes: [
    part(S64, 0, 3, 0, 8, 4, 10, 0, 10),
    part(S64, 0, 5, 6, 8, 5, 5, 0, 1),
    part(S64, -4, 6, 8, 3, 4, 0, 0, 20),
    part(S64, 4, 6, 8, 3, 4, 0, 0, 20, { mirror: true }),
    part(S64, 0, 4, -6, 4, 1, 6, 2, 16),
  ],
};

const frog: EntityDef = {
  id: "frog",
  category: "passive",
  texture: "entity/frog/frog_temperate.png",
  texW: 64,
  texH: 32,
  crop: [0, 0, 8, 5],
  boxes: [
    part({ texW: 64, texH: 32 }, 0, 4, 0, 8, 5, 8, 0, 8),
    part({ texW: 64, texH: 32 }, 0, 8, 4, 8, 5, 6, 0, 0),
    part({ texW: 64, texH: 32 }, -3, 2, 2, 3, 3, 3, 16, 0),
    part({ texW: 64, texH: 32 }, 3, 2, 2, 3, 3, 3, 16, 0, { mirror: true }),
  ],
};

const wither: EntityDef = {
  id: "wither",
  category: "hostile",
  texture: "entity/wither/wither.png",
  texW: 64,
  texH: 64,
  crop: [0, 0, 8, 8],
  boxes: [
    part(S64, 0, 28, 0, 8, 8, 8, 0, 16),
    part(S64, -10, 30, 0, 6, 6, 6, 0, 0),
    part(S64, 10, 30, 0, 6, 6, 6, 32, 0),
    part(S64, 0, 16, 0, 20, 10, 8, 0, 32),
  ],
};

export const ENTITIES: EntityDef[] = [
  creeper,
  quadruped("pig", "entity/pig.png", S64, "passive", { body: [10, 8, 16], head: [8, 8, 8], leg: [4, 6], nose: [4, 3, 1] }, { body: [28, 8], head: [0, 0], leg: [0, 16], nose: [16, 16] }),
  chicken,
  slime("slime", "entity/slime.png"),
  slime("magma_cube", "entity/slime/magmacube.png"),
  humanoid("zombie", "entity/zombie/zombie.png", S64, "hostile", { overlay: true }),
  humanoid("husk", "entity/zombie/husk.png", S64, "hostile", { overlay: true }),
  humanoid("drowned", "entity/zombie/drowned.png", S64, "hostile", { overlay: true }),
  humanoid("skeleton", "entity/skeleton/skeleton.png", S32, "hostile"),
  humanoid("stray", "entity/skeleton/stray.png", S32, "hostile"),
  humanoid("bogged", "entity/skeleton/bogged.png", S64, "hostile"),
  humanoid("wither_skeleton", "entity/skeleton/wither_skeleton.png", S64, "hostile", { thin: true, tall: true }),
  spider("spider", "entity/spider/spider.png"),
  spider("cave_spider", "entity/spider/cave_spider.png"),
  humanoid("enderman", "entity/enderman/enderman.png", S32, "hostile", { thin: true, tall: true }),
  blaze,
  ghast("ghast", "entity/ghast/ghast.png", "hostile"),
  ghast("happy_ghast", "entity/ghast/happy_ghast.png", "passive"),
  villager("villager", "entity/villager/villager.png", "passive"),
  villager("witch", "entity/witch/witch.png", "hostile", true),
  villager("wandering_trader", "entity/wandering_trader/wandering_trader.png", "passive"),
  villager("zombie_villager", "entity/zombie_villager/zombie_villager.png", "hostile"),
  ironGolem,
  {
    id: "snow_golem",
    category: "passive",
    texture: "entity/snow_golem/snow_golem.png",
    texW: 64,
    texH: 64,
    crop: [0, 0, 8, 8],
    boxes: [part(S64, 0, 6, 0, 10, 12, 10, 0, 16), part(S64, 0, 18, 0, 8, 8, 8, 0, 0), part(S64, 0, 12, 0, 8, 8, 8, 0, 36)],
  },
  quadruped("wolf", "entity/wolf/wolf.png", S32, "passive", { body: [6, 6, 12], head: [6, 6, 4], leg: [2, 8] }, { body: [18, 14], head: [0, 0], leg: [0, 18] }),
  quadruped("cat", "entity/cat/cat_tabby.png", S32, "passive", { body: [4, 6, 12], head: [5, 4, 5], leg: [2, 6] }, { body: [20, 0], head: [0, 0], leg: [0, 16] }),
  quadruped("ocelot", "entity/cat/ocelot.png", S32, "passive", { body: [4, 6, 12], head: [5, 4, 5], leg: [2, 6] }, { body: [20, 0], head: [0, 0], leg: [0, 16] }),
  quadruped("fox", "entity/fox/fox.png", { texW: 48, texH: 32 }, "passive", { body: [6, 6, 12], head: [8, 6, 6], leg: [2, 6] }, { body: [24, 21], head: [0, 0], leg: [4, 9] }),
  quadruped("cow", "entity/cow/cow_temperate.png", S64, "passive", { body: [12, 10, 18], head: [8, 8, 6], leg: [4, 12] }, { body: [18, 4], head: [0, 0], leg: [0, 16] }),
  quadruped("mooshroom", "entity/cow/mooshroom_red.png", S64, "passive", { body: [12, 10, 18], head: [8, 8, 6], leg: [4, 12] }, { body: [18, 4], head: [0, 0], leg: [0, 16] }),
  quadruped("sheep", "entity/sheep/sheep.png", S32, "passive", { body: [6, 8, 16], head: [6, 6, 8], leg: [3, 6] }, { body: [28, 8], head: [0, 0], leg: [0, 16] }, [
    part(S32, 0, 11, 0, 8, 16, 6, 0, 0, { texture: "entity/sheep/sheep_wool.png", inflate: 0.6, spin: { x: 90 } }),
  ]),
  quadruped("horse", "entity/horse/horse_brown.png", S64, "passive", { body: [10, 10, 22], head: [6, 5, 10], leg: [4, 12] }, { body: [0, 32], head: [0, 0], leg: [48, 21] }),
  quadruped("donkey", "entity/horse/donkey.png", S64, "passive", { body: [10, 10, 20], head: [6, 5, 8], leg: [4, 12] }, { body: [0, 32], head: [0, 0], leg: [48, 21] }),
  quadruped("llama", "entity/llama/llama_creamy.png", { texW: 128, texH: 64 }, "passive", { body: [10, 12, 16], head: [6, 14, 6], leg: [4, 12] }, { body: [0, 28], head: [0, 0], leg: [0, 46] }),
  quadruped("rabbit", "entity/rabbit/rabbit_brown.png", S64, "passive", { body: [4, 4, 6], head: [4, 4, 4], leg: [2, 4] }, { body: [0, 16], head: [32, 0], leg: [0, 24] }),
  quadruped("turtle", "entity/turtle/turtle.png", { texW: 128, texH: 64 }, "passive", { body: [12, 6, 16], head: [6, 4, 6], leg: [3, 4] }, { body: [7, 37], head: [3, 0], leg: [0, 16] }),
  quadruped("panda", "entity/panda/panda.png", S64, "passive", { body: [12, 10, 16], head: [10, 8, 8], leg: [4, 8] }, { body: [0, 24], head: [0, 6], leg: [0, 40] }),
  quadruped("polar_bear", "entity/bear/polarbear.png", { texW: 128, texH: 64 }, "passive", { body: [14, 12, 18], head: [8, 8, 8], leg: [4, 10] }, { body: [0, 28], head: [0, 0], leg: [0, 18] }),
  quadruped("goat", "entity/goat/goat.png", S64, "passive", { body: [10, 10, 16], head: [6, 8, 8], leg: [3, 8] }, { body: [0, 28], head: [0, 0], leg: [0, 16] }),
  quadruped("hoglin", "entity/hoglin/hoglin.png", { texW: 128, texH: 64 }, "hostile", { body: [14, 12, 22], head: [10, 8, 12], leg: [4, 10] }, { body: [0, 36], head: [0, 0], leg: [50, 0] }),
  quadruped("zoglin", "entity/hoglin/zoglin.png", { texW: 128, texH: 64 }, "hostile", { body: [14, 12, 22], head: [10, 8, 12], leg: [4, 10] }, { body: [0, 36], head: [0, 0], leg: [50, 0] }),
  quadruped("strider", "entity/strider/strider.png", { texW: 64, texH: 128 }, "passive", { body: [16, 8, 16], head: [8, 6, 6], leg: [3, 14] }, { body: [0, 32], head: [0, 0], leg: [0, 48] }),
  bat,
  bee,
  {
    id: "parrot",
    category: "passive",
    texture: "entity/parrot/parrot_red_blue.png",
    texW: 32,
    texH: 32,
    crop: [2, 2, 4, 4],
    boxes: [
      part({ texW: 32, texH: 32 }, 0, 8, 0, 4, 6, 4, 2, 8),
      part({ texW: 32, texH: 32 }, 0, 13, 1, 3, 4, 3, 2, 2),
      part({ texW: 32, texH: 32 }, -3, 9, 0, 4, 1, 6, 10, 8),
      part({ texW: 32, texH: 32 }, 3, 9, 0, 4, 1, 6, 10, 8, { mirror: true }),
      part({ texW: 32, texH: 32 }, 0, 4, 2, 2, 4, 2, 14, 18),
    ],
  },
  axolotl,
  frog,
  allay,
  vex,
  phantom,
  shulker,
  {
    id: "guardian",
    category: "hostile",
    texture: "entity/guardian/guardian.png",
    texW: 64,
    texH: 64,
    crop: [0, 0, 12, 12],
    boxes: [
      part(S64, 0, 10, 0, 12, 12, 12, 0, 0),
      part(S64, 0, 10, 7, 4, 4, 2, 8, 0),
      ...[0, 60, 120, 180, 240, 300].flatMap((yaw) => [1, -1].map((side) => part(S64, Math.cos((yaw * Math.PI) / 180) * 8, 10 + side * 4, Math.sin((yaw * Math.PI) / 180) * 8, 2, 8, 2, 0, 16))),
    ],
  },
  {
    id: "elder_guardian",
    category: "hostile",
    texture: "entity/guardian/guardian_elder.png",
    texW: 64,
    texH: 64,
    crop: [0, 0, 12, 12],
    boxes: [part(S64, 0, 14, 0, 16, 16, 16, 0, 0), part(S64, 0, 14, 9, 6, 6, 2, 8, 0)],
  },
  squid("squid", "entity/squid/squid.png"),
  squid("glow_squid", "entity/squid/glow_squid.png"),
  {
    id: "silverfish",
    category: "hostile",
    texture: "entity/silverfish/silverfish.png",
    texW: 64,
    texH: 32,
    crop: [0, 0, 8, 4],
    boxes: [part(S32, 0, 3, 0, 8, 4, 6, 0, 0), part(S32, 0, 4, 5, 6, 3, 4, 0, 9), part(S32, 0, 3, -5, 4, 3, 3, 20, 0)],
  },
  {
    id: "endermite",
    category: "hostile",
    texture: "entity/endermite/endermite.png",
    texW: 64,
    texH: 32,
    crop: [0, 0, 6, 4],
    boxes: [part(S32, 0, 3, 0, 6, 4, 4, 0, 0), part(S32, 0, 4, 3, 4, 3, 2, 0, 8), part(S32, 0, 3, -3, 3, 2, 2, 0, 14)],
  },
  humanoid("piglin", "entity/piglin/piglin.png", S64, "hostile"),
  humanoid("piglin_brute", "entity/piglin/piglin_brute.png", S64, "hostile"),
  humanoid("zombified_piglin", "entity/piglin/zombified_piglin.png", S64, "hostile"),
  humanoid("pillager", "entity/illager/pillager.png", S64, "hostile"),
  humanoid("vindicator", "entity/illager/vindicator.png", S64, "hostile"),
  humanoid("evoker", "entity/illager/evoker.png", S64, "hostile"),
  {
    id: "ravager",
    category: "hostile",
    texture: "entity/illager/ravager.png",
    texW: 128,
    texH: 128,
    crop: [0, 0, 16, 16],
    boxes: [
      part({ texW: 128, texH: 128 }, 0, 22, 0, 20, 16, 24, 0, 40),
      part({ texW: 128, texH: 128 }, 0, 34, 12, 16, 16, 16, 0, 0),
      part({ texW: 128, texH: 128 }, -6, 8, 8, 6, 16, 6, 96, 0),
      part({ texW: 128, texH: 128 }, 6, 8, 8, 6, 16, 6, 96, 0, { mirror: true }),
      part({ texW: 128, texH: 128 }, -6, 8, -8, 6, 16, 6, 96, 0),
      part({ texW: 128, texH: 128 }, 6, 8, -8, 6, 16, 6, 96, 0, { mirror: true }),
    ],
  },
  {
    id: "warden",
    category: "hostile",
    texture: "entity/warden/warden.png",
    texW: 128,
    texH: 128,
    crop: [0, 0, 16, 16],
    boxes: [
      part({ texW: 128, texH: 128 }, 0, 42, 0, 16, 16, 16, 0, 0),
      part({ texW: 128, texH: 128 }, 0, 26, 0, 16, 20, 10, 0, 32),
      part({ texW: 128, texH: 128 }, -10, 24, 0, 6, 28, 6, 48, 0),
      part({ texW: 128, texH: 128 }, 10, 24, 0, 6, 28, 6, 48, 0, { mirror: true }),
      part({ texW: 128, texH: 128 }, -4, 10, 0, 6, 20, 6, 80, 0),
      part({ texW: 128, texH: 128 }, 4, 10, 0, 6, 20, 6, 80, 0, { mirror: true }),
    ],
  },
  {
    id: "breeze",
    category: "hostile",
    texture: "entity/breeze/breeze.png",
    texW: 32,
    texH: 32,
    crop: [0, 0, 8, 8],
    boxes: [
      part({ texW: 32, texH: 32 }, 0, 22, 0, 8, 8, 8, 0, 0),
      part({ texW: 32, texH: 32 }, 0, 12, 0, 6, 12, 6, 0, 8, { cutout: true }),
      part({ texW: 32, texH: 32 }, 0, 4, 0, 10, 4, 10, 8, 16),
    ],
  },
  humanoid("copper_golem", "entity/copper_golem/copper_golem.png", S64, "passive"),
  {
    id: "armadillo",
    category: "passive",
    texture: "entity/armadillo/armadillo.png",
    texW: 64,
    texH: 64,
    crop: [0, 0, 8, 6],
    boxes: [
      part(S64, 0, 5, 0, 8, 6, 12, 0, 20),
      part(S64, 0, 7, 7, 6, 5, 5, 0, 0),
      part(S64, 0, 9, 0, 10, 3, 14, 0, 32),
    ],
  },
  {
    id: "sniffer",
    category: "passive",
    texture: "entity/sniffer/sniffer.png",
    texW: 192,
    texH: 192,
    crop: [0, 0, 16, 16],
    boxes: [
      part({ texW: 192, texH: 192 }, 0, 18, 0, 20, 16, 28, 0, 40),
      part({ texW: 192, texH: 192 }, 0, 22, 18, 12, 10, 14, 0, 0),
      part({ texW: 192, texH: 192 }, -6, 8, 8, 6, 16, 6, 80, 0),
      part({ texW: 192, texH: 192 }, 6, 8, 8, 6, 16, 6, 80, 0),
      part({ texW: 192, texH: 192 }, -6, 8, -8, 6, 16, 6, 80, 0),
      part({ texW: 192, texH: 192 }, 6, 8, -8, 6, 16, 6, 80, 0),
    ],
  },
  {
    id: "camel",
    category: "passive",
    texture: "entity/camel/camel.png",
    texW: 128,
    texH: 128,
    crop: [0, 0, 10, 8],
    boxes: [
      part({ texW: 128, texH: 128 }, 0, 28, 0, 12, 10, 28, 0, 40),
      part({ texW: 128, texH: 128 }, 0, 40, 4, 8, 14, 8, 0, 0),
      part({ texW: 128, texH: 128 }, 0, 48, 10, 6, 8, 8, 20, 0),
      part({ texW: 128, texH: 128 }, -4, 12, 8, 4, 24, 4, 80, 0),
      part({ texW: 128, texH: 128 }, 4, 12, 8, 4, 24, 4, 80, 0),
      part({ texW: 128, texH: 128 }, -4, 12, -8, 4, 24, 4, 80, 0),
      part({ texW: 128, texH: 128 }, 4, 12, -8, 4, 24, 4, 80, 0),
    ],
  },
  {
    id: "creaking",
    category: "hostile",
    texture: "entity/creaking/creaking.png",
    texW: 64,
    texH: 64,
    crop: [0, 0, 8, 8],
    boxes: humanoid("creaking", "entity/creaking/creaking.png", S64, "hostile", { thin: true, tall: true }).boxes,
  },
  wither,
  {
    id: "cod",
    category: "ambient",
    texture: "entity/fish/cod.png",
    texW: 32,
    texH: 32,
    crop: [0, 0, 8, 4],
    boxes: [part({ texW: 32, texH: 32 }, 0, 4, 0, 4, 3, 8, 0, 0), part({ texW: 32, texH: 32 }, 0, 4, -5, 0, 4, 4, 0, 4)],
  },
  {
    id: "salmon",
    category: "ambient",
    texture: "entity/fish/salmon.png",
    texW: 32,
    texH: 32,
    crop: [0, 0, 8, 4],
    boxes: [part({ texW: 32, texH: 32 }, 0, 5, 0, 5, 4, 10, 0, 0), part({ texW: 32, texH: 32 }, 0, 6, -6, 0, 5, 5, 0, 6)],
  },
  {
    id: "dolphin",
    category: "ambient",
    texture: "entity/dolphin/dolphin.png",
    texW: 64,
    texH: 64,
    crop: [0, 0, 8, 8],
    boxes: [
      part(S64, 0, 8, 0, 6, 6, 16, 0, 16),
      part(S64, 0, 12, 8, 6, 6, 6, 0, 0),
      part(S64, 0, 10, -8, 2, 6, 6, 0, 22),
      part(S64, -4, 8, 0, 6, 1, 4, 20, 0),
      part(S64, 4, 8, 0, 6, 1, 4, 20, 0, { mirror: true }),
    ],
  },
  {
    id: "nautilus",
    category: "passive",
    texture: "entity/nautilus/nautilus.png",
    texW: 128,
    texH: 128,
    crop: [0, 0, 16, 16],
    boxes: [part({ texW: 128, texH: 128 }, 0, 10, 0, 14, 14, 16, 0, 0), part({ texW: 128, texH: 128 }, 0, 10, 10, 8, 6, 6, 0, 32)],
  },
];

const BY_ID = new Map(ENTITIES.map((entity) => [entity.id, entity]));

export function entityDef(id: string) {
  return BY_ID.get(id.replace(/^entity:/, ""));
}
