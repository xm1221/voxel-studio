import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { projectToBbmodel, propClipFromBbmodel } from "../lib/bbmodel-io.ts";
import { gltfToGlb, parseGlb, projectToGltf, propClipFromGltf, writeGltfJson } from "../lib/gltf-io.ts";
import { fetchPlayerSkin } from "../lib/player-lookup.ts";
import { addCatalogProp, addCustom, addSkinPlayer, blankProject, customFromImage, customFromModelText, openProject, parseCamera, parseJointList, pngDataUrl, projectErrors, replacePropClip, searchCatalog, withCamera, writeJointKeyframe, writeKeyframe } from "../lib/project-edit.ts";
import type { ProjectFile } from "../lib/project.ts";
import type { PropChannels } from "../lib/prop-clip.ts";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function loadProject(path: string): ProjectFile {
  const value = readJson(path);
  const opened = openProject(value);
  if ("error" in opened) throw new Error(opened.error);
  return opened.project;
}

function save(path: string, project: ProjectFile) {
  writeJson(path, project);
}

function arg(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function has(argv: string[], name: string) {
  return argv.includes(name);
}

function vec(text: string | undefined): PropChannels[keyof PropChannels] | undefined {
  if (!text) return undefined;
  const [x, y, z] = text.split(",").map(Number);
  if (![x, y, z].every((value) => Number.isFinite(value))) throw new Error(`expected x,y,z numbers, got ${text}`);
  return { x, y, z };
}

function textureMap(project: ProjectFile) {
  const bytes = new Map<string, Uint8Array>();
  const urls = new Map<string, string>();
  const roots = ["public/vanilla/26.3", "public/vanilla"];
  const keys = new Set<string>();
  for (const asset of project.customs) {
    for (const [key, url] of Object.entries(asset.textures)) {
      urls.set(key, url);
      const match = /^data:image\/png;base64,([a-z0-9+/]+={0,2})$/i.exec(url);
      if (match) bytes.set(key, Buffer.from(match[1], "base64"));
    }
  }
  for (const prop of project.scene.props ?? []) keys.add(prop.catalogId);
  for (const key of keys) {
    if (bytes.has(key)) continue;
    for (const root of roots) {
      const path = join(root, key);
      if (existsSync(path)) {
        const file = readFileSync(path);
        bytes.set(key, file);
        urls.set(key, `data:image/png;base64,${file.toString("base64")}`);
        break;
      }
    }
  }
  return { bytes, urls };
}

function usage() {
  return `pixelstage <command>

  init [file]                         write a blank project (pixelstage.project.json)
  validate <file>                     print schema errors, or ok
  list [query]                        search the catalog (generated file if present)
  add <file> <catalogId>              place a block, item, or entity
  add <file> --png <image> --kind item|block
  add <file> --model <file.json|.bbmodel>
  add <file> --player <name>           fetch that account's skin and add a player
  add <file> --skin <image.png> [--name Steve] [--slim]
  keyframe <file> --prop <id> --time <seconds> [--pos x,y,z] [--rot x,y,z] [--scale x,y,z]
  keyframe <file> --time <seconds> --joint rArmZ=-40,headY=10 [--player <id>]
  export <file> --gltf <out.gltf> | --glb <out.glb> | --bbmodel <out.bbmodel>
  import <file> --bbmodel <in.bbmodel> | --gltf <in.gltf> | --glb <in.glb>
  render <file> --out <dir> [--fps 12] [--seconds 1] [--width 320] [--height 180]
                [--camera px,py,pz,tx,ty,tz] [--url http://127.0.0.1:3000]

Stage units: 16 = 1 block. Share links omit custom PNG bytes; project files keep them.
`;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (!command || command === "help" || command === "--help") {
      process.stdout.write(usage());
      return 0;
    }
    if (command === "init") {
      const file = rest[0] || "pixelstage.project.json";
      save(file, blankProject());
      process.stdout.write(`wrote ${file}\n`);
      return 0;
    }
    if (command === "validate") {
      const file = rest[0];
      if (!file) throw new Error("validate needs a project file");
      const errors = projectErrors(readJson(file));
      if (errors.length) {
        for (const error of errors) process.stderr.write(`${error}\n`);
        return 1;
      }
      process.stdout.write("ok\n");
      return 0;
    }
    if (command === "list") {
      const query = rest[0] ?? "";
      const catalogPath = "public/vanilla/catalog.json";
      const file = existsSync(catalogPath) ? readJson(catalogPath) : undefined;
      const rows = searchCatalog(query, file);
      for (const row of rows) process.stdout.write(`${row.id}\t${row.kind}\t${row.en}\t${row.zh}\n`);
      if (!rows.length) process.stdout.write("(no matches)\n");
      return 0;
    }
    if (command === "add") {
      const file = rest[0];
      if (!file) throw new Error("add needs a project file");
      const project = loadProject(file);
      const png = arg(rest, "--png");
      const model = arg(rest, "--model");
      const playerName = arg(rest, "--player");
      const skin = arg(rest, "--skin");
      let next = project;
      if (playerName) {
        const fetched = await fetchPlayerSkin(playerName);
        const added = addSkinPlayer(project, { name: fetched.name, model: fetched.model, skin: fetched.skin, cape: fetched.cape });
        if ("error" in added) throw new Error(added.error);
        next = added.project;
        save(file, next);
        process.stdout.write(`added player ${added.playerId} ${fetched.name}\n`);
        return 0;
      }
      if (skin) {
        const added = addSkinPlayer(project, {
          name: arg(rest, "--name") || skin.split("/").pop()?.replace(/\.png$/i, "") || "Player",
          model: has(rest, "--slim") ? "slim" : "default",
          skin: pngDataUrl(readFileSync(skin)),
        });
        if ("error" in added) throw new Error(added.error);
        next = added.project;
        save(file, next);
        process.stdout.write(`added player ${added.playerId} ${next.scene.players.at(-1)?.name ?? ""}\n`);
        return 0;
      }
      if (png) {
        const kind = arg(rest, "--kind") === "block" ? "block" : "item";
        const added = addCustom(project, customFromImage(png.split("/").pop()?.replace(/\.png$/i, "") || "custom", kind, readFileSync(png)));
        if ("error" in added) throw new Error(added.error);
        next = added.project;
      } else if (model) {
        const added = addCustom(project, customFromModelText(model, readFileSync(model, "utf8")));
        if ("error" in added) throw new Error(added.error);
        next = added.project;
      } else {
        const id = rest[1];
        if (!id || id.startsWith("--")) throw new Error("add needs a catalog id, --png, --model, --player, or --skin");
        const added = addCatalogProp(project, id);
        if ("error" in added) throw new Error(added.error);
        next = added.project;
      }
      save(file, next);
      const prop = next.scene.props?.at(-1);
      process.stdout.write(`added ${prop?.id ?? "prop"} ${prop?.catalogId ?? ""}\n`);
      return 0;
    }
    if (command === "keyframe") {
      const file = rest[0];
      const prop = arg(rest, "--prop");
      const joint = arg(rest, "--joint");
      const time = Number(arg(rest, "--time"));
      if (!file || !Number.isFinite(time)) throw new Error("keyframe needs <file> --time <seconds>");
      if (joint) {
        const parsed = parseJointList(joint);
        if ("error" in parsed) throw new Error(parsed.error);
        const updated = writeJointKeyframe(loadProject(file), arg(rest, "--player"), time, parsed.joints, parsed.scalars);
        if ("error" in updated) throw new Error(updated.error);
        save(file, updated.project);
        process.stdout.write(`keyed joints @ ${time}\n`);
        return 0;
      }
      if (!prop) throw new Error("keyframe needs --prop <id> or --joint name=value");
      const channels: PropChannels = {};
      const position = vec(arg(rest, "--pos"));
      const rotation = vec(arg(rest, "--rot"));
      const scale = vec(arg(rest, "--scale"));
      if (position) channels.position = position;
      if (rotation) channels.rotation = rotation;
      if (scale) channels.scale = scale;
      if (!position && !rotation && !scale) throw new Error("keyframe needs --pos, --rot, or --scale");
      const updated = writeKeyframe(loadProject(file), prop, time, channels);
      if ("error" in updated) throw new Error(updated.error);
      save(file, updated.project);
      process.stdout.write(`keyed ${prop} @ ${time}\n`);
      return 0;
    }
    if (command === "export") {
      const file = rest[0];
      if (!file) throw new Error("export needs a project file");
      const project = loadProject(file);
      const textures = textureMap(project);
      const gltf = arg(rest, "--gltf");
      const glb = arg(rest, "--glb");
      const bbmodel = arg(rest, "--bbmodel");
      if (!gltf && !glb && !bbmodel) throw new Error("export needs --gltf, --glb, or --bbmodel");
      if (gltf || glb) {
        const document = projectToGltf(project, textures.bytes);
        if (gltf) {
          const binName = gltf.replace(/\.gltf$/i, "") + ".bin";
          writeJson(gltf, writeGltfJson(document, binName.split("/").pop() || "scene.bin"));
          writeFileSync(binName, document.bin);
          process.stdout.write(`wrote ${gltf}\n`);
        }
        if (glb) {
          mkdirSync(dirname(resolve(glb)), { recursive: true });
          writeFileSync(glb, gltfToGlb(document));
          process.stdout.write(`wrote ${glb}\n`);
        }
      }
      if (bbmodel) {
        writeJson(bbmodel, projectToBbmodel(project, textures.urls));
        process.stdout.write(`wrote ${bbmodel}\n`);
      }
      return 0;
    }
    if (command === "import") {
      const file = rest[0];
      if (!file) throw new Error("import needs a project file");
      const project = loadProject(file);
      const ids = (project.scene.props ?? []).map((prop) => prop.id);
      const bbmodel = arg(rest, "--bbmodel");
      const gltf = arg(rest, "--gltf");
      const glb = arg(rest, "--glb");
      let clip = null;
      if (bbmodel) clip = propClipFromBbmodel(readJson(bbmodel), ids);
      else if (glb) {
        const parsed = parseGlb(readFileSync(glb));
        if (!parsed) throw new Error("not a glb file");
        clip = propClipFromGltf(parsed.json, parsed.bin, ids);
      } else if (gltf) {
        const json = readJson(gltf) as { buffers?: Array<{ uri?: string }> };
        const uri = json.buffers?.[0]?.uri;
        if (!uri || uri.startsWith("data:")) throw new Error("gltf import expects a sibling .bin buffer");
        const bin = readFileSync(join(dirname(gltf), uri));
        clip = propClipFromGltf(json, bin, ids);
      } else throw new Error("import needs --bbmodel, --gltf, or --glb");
      if (!clip) throw new Error("no prop animation in that file");
      const updated = replacePropClip(project, clip);
      if ("error" in updated) throw new Error(updated.error);
      save(file, updated.project);
      process.stdout.write(`imported ${clip.keyframes.length} key times\n`);
      return 0;
    }
    if (command === "render") {
      const file = rest[0];
      const out = arg(rest, "--out");
      if (!file || !out) throw new Error("render needs <file> --out <dir>");
      const { renderProject } = await import("./render.ts");
      let project = loadProject(file);
      const cameraText = arg(rest, "--camera");
      if (cameraText) {
        const camera = parseCamera(cameraText);
        if ("error" in camera) throw new Error(camera.error);
        const updated = withCamera(project, camera);
        if ("error" in updated) throw new Error(updated.error);
        project = updated.project;
      }
      await renderProject({
        project,
        out,
        fps: Number(arg(rest, "--fps") ?? 12),
        seconds: Number(arg(rest, "--seconds") ?? 1),
        width: Number(arg(rest, "--width") ?? 320),
        height: Number(arg(rest, "--height") ?? 180),
        url: arg(rest, "--url") ?? "http://127.0.0.1:3000",
        gif: has(rest, "--gif") || !has(rest, "--png-only"),
        mp4: has(rest, "--mp4") || !has(rest, "--png-only"),
        webm: has(rest, "--webm") || !has(rest, "--png-only"),
      });
      return 0;
    }
    throw new Error(`unknown command ${command}`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("pixelstage.ts") || entry.endsWith("pixelstage.js")) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
