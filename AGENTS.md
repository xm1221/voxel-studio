<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on Pixelstage

Pixelstage renders Minecraft skins in the browser with three.js and exports
PNGs, GIFs, and MP4s. This file is the short map: how to run things, what the
scene JSON can say, and how to drive the renderer from a script.

## Commands

Node.js 22 or newer is required (`package.json` pins `engines.node`).

```bash
npm install
npm run dev -- --port 38471     # http://127.0.0.1:38471 (no /mcrender prefix in dev)
npm test                        # node:test over tests/*.test.ts, no browser
npm run build && npm start      # production build, served under /mcrender
npx tsc --noEmit                # types only
npx eslint                      # one pre-existing error in components/prop-shelf.tsx
```

## Headless renderer (CLI)

`scripts/render.mjs` boots the built app on a local port, opens `/render` in
headless Chrome with SwiftShader, hands the scene to the page, and writes what
the page returns. Frames are rendered deterministically — frame `i` is posed at
`i / frames * seconds`, not at wall-clock time — so two runs of the same scene
give the same PNG and GIF bytes.

```bash
npm run build
npm run render -- examples/scenes/hero-square.json --out poster.png
npm run render -- examples/scenes/hero-square.json --out clip.mp4 --fps 30 --edge 1080
npm run render -- examples/scenes/duo-promo.json    --out clip.gif --frames 24
npm run render -- examples/scenes/poster-4k.json    --out poster-4k.png
npm run render -- examples/animations/bow-v1.json   --out legacy.gif
```

Output type comes from the `--out` extension: `.png`, `.gif`, or `.mp4`.
Useful flags: `--format square|story|uhd|…`, `--width`/`--height` (paired),
`--fps`, `--edge 480|720|1080`, `--frames`, `--seconds`, `--bitrate`,
`--transparent`, `--round`, `--port`, `--url` (use a server that is already
running, including `next dev`), `--chrome`, `--json`. `npm run render -- -h`
prints the full list.

Notes:

- The page needs a secure context for WebCodecs. `http://127.0.0.1` counts.
- If Chrome cannot encode H.264, MP4 export fails with `err.mp4Codec`; VP9 and
  AV1 are tried too. The CLI surfaces the message and exits non-zero.
- A production build carries `basePath: /mcrender`; the CLI reads it from
  `.next/routes-manifest.json` and probes the bare path as a fallback.
- Set `PIXELSTAGE_RENDER_VERBOSE=1` to see the server log and page console.

## Scene JSON v2

A scene file is one object. Unknown top-level fields are rejected. See
`schema/pixelstage.scene.schema.json` (draft 2020-12) for the exact shapes and
`examples/scenes/` for runnable files.

```json
{
  "v": 2,
  "cast": [
    { "name": "Steve", "skin": "steve", "pose": "hero", "motion": "wave" }
  ],
  "camera": { "preset": "full" },
  "stage": { "pack": "hero-studio" },
  "text": { "title": "Steve, rebuilt", "template": "mod-promo" },
  "export": { "format": "square", "motion": { "fps": 15, "gifEdge": 720 } }
}
```

| Key | What it holds |
| --- | --- |
| `v` | Must be `2`. |
| `meta` | `name`, `author`, `note`. Free text, shown nowhere but in the file. |
| `cast` | 1–4 members. `skin` (`steve`, `alex`, data URL, or http(s) URL), `username`, `model` (`default`/`slim`), `pose`, `motion`, `position`, `scale`, `nametag`, `bubble`, `outer`, `layers`, `cape`, `showCape`. |
| `camera` | `preset` (`full`, `head`, `wide`) or `position`/`target` triples. |
| `stage` | `pack`, `background`, `grade`, `outline`, `godrays`, `light`, `keyIntensity`, `backgroundImage`, `backgroundFit`. Later fields win over the pack. |
| `props` | Up to 64. `item` catalog id (`block:stone`, `item:diamond_sword`, `entity:creeper`) or a legacy alias, plus `position`, `rotation`, `scale`, `hidden`. |
| `text` | Poster title block: `title`, `subtitle`, `kicker`, `template`, `scale`, `panel`. |
| `export` | `format` and a `motion` block (`fps`, `gifEdge`, `mp4Edge`, `mp4Fps`, `mp4Bitrate`, `frames`). |

Poses (`pose`): `idle`, `wave`, `flex`, `think`, `salute`, `sit`, `hero`,
`walk`. `pose` may also be an object of joint angles (`{ "headX": 10 }`).

Motion presets (`motion`, as a plain string or `{ "preset": …, "speed": … }`):

| id | what it does |
| --- | --- |
| `none` | Holds the pose. GIF export does a slow turntable, as it always has. |
| `idle` | Breathing: shoulders, elbows, cape. |
| `walk` | Alternating arms and legs, knees on the backswing. |
| `run` | Bigger stride, more bounce. |
| `wave` | Right arm raised, forearm swinging. |
| `cheer` | Both arms up, elbows and knees on the beat. |
| `crouch` | Sneaking: low body, leaning forward. |
| `attack` | Sword swing down and across, with a body turn. |
| `fly` | Leaning forward, arms swept back, cape lifted. |
| `swim` | Breaststroke: arms reach out in turn, legs follow. |
| `nod` | Small head nod, shoulders nearly still. |
| `spin` | One full turn about the vertical axis. |
| `jump` | Crouch, push off, land. |
| `sit` | Seated loop with breathing and swinging calves. |

`motion` may instead be `{ "speed": 1, "animation": { …v1 animation… } }`, or a
bare v1 animation object. Keyframes carry `time`, `joints`, `bob`, `sway`,
`roll`, `cape`, an optional `ease` (`linear`, `smoothstep`, `ease-in-out`;
omitted means smoothstep), and an optional `yaw` in degrees. Old v1 files with
none of the new fields parse and interpolate exactly as before.

Stage packs (`stage.pack`): `hero-studio`, `promo-poster`, `x-header`,
`nether-cinema`, `ice-sheen`, `sticker-sheet`, `vertical-hero`,
`hologram-lab`. Each sets background, grade, outline, godrays, light, key
intensity, and a camera. Poster templates (`text.template`): `clean`,
`mod-promo`, `x-header`, `vertical-card`, `wallpaper`, `lower-third`.

Export formats: `avatar` (800²), `square` (1080²), `xhs` (1080×1440),
`youtube` (1280×720), `story` (1080×1920), `desktop` (1920×1080), `banner`
(1500×500), `uhd` (3840×2160), plus `pfp`, `thumb`, `phone`.

A bare v1 animation file (the format the timeline imports and exports) is also
accepted by the CLI and by `loadScene`: it becomes a one-avatar scene with a
warning.

## Browser API: `window.pixelstage`

Registered by the studio and by `/render` as soon as the WebGL engine exists.
Everything returns a Promise; scenes and options use the same names as the JSON
above. Failures are values, not throws: `loadScene` resolves
`{ ok: false, errors: [{ path, message, code }] }`, and error `code`s are i18n
keys such as `err.sceneMotion`.

```js
await window.pixelstage.ready;
await window.pixelstage.loadScene(sceneObject); // v2 object, or a bare v1 animation
const png = await window.pixelstage.exportPNG({ format: "uhd", transparent: true });
const gif = await window.pixelstage.exportGIF({ frames: 24, fps: 12, longEdge: 720 });
const mp4 = await window.pixelstage.exportMP4({ fps: 30, longEdge: 1080, bitrate: 8e6 });

window.pixelstage.renderFrame({ width: 512, height: 512, time: 0.4 }); // one still
window.pixelstage.getScene();      // current scene as a v2 document
window.pixelstage.getCamera();     // { p: [x,y,z], t: [x,y,z] }
window.pixelstage.setCamera({ p: [14, 8, 52], t: [0, 5, 0] });
await window.pixelstage.loadSceneFromUrl("/scenes/hero-square.json");
window.pixelstage.readyState;      // "booting" | "ready" | "closed"
```

`exportPNG`/`renderFrame`/`exportGIF`/`exportMP4` return
`{ dataUrl, mime, width, height }` (motion results add `frames`, `fps`,
`seconds`). Pass `text: null` to suppress the poster for one export.

A scene can also be opened straight from a URL in the studio:
`/?scene=https://example.com/scene.json` or `/?scene64=<base64url JSON>`.

## Where things live

| Path | Purpose |
| --- | --- |
| `lib/scene-doc.ts` | v2 parse/serialize, v1 wrapping, validation and error codes |
| `lib/motion.ts` | presets, v1 animation parsing, easing, sampling |
| `lib/motion-export.ts` | GIF/MP4 frame plans and limits |
| `lib/capture.ts` | deterministic still and per-frame rendering |
| `lib/mp4.ts` | WebCodecs + Mediabunny MP4 encoder |
| `lib/poster.ts` | poster text layouts, drawn after the 3D frame |
| `lib/scene-packs.ts` | the eight one-click looks |
| `lib/render-api.ts`, `lib/stage-hooks.ts` | `window.pixelstage` and its handlers |
| `app/render/page.tsx` | headless page the CLI drives |
| `scripts/render.mjs` | CLI |
| `schema/`, `examples/` | JSON Schema and runnable scenes |

## Rules of the road

- Keep the existing UI, skin, and layout. New features go in as extra controls
  or extra files; do not redesign the studio.
- Do not add Theatre.js (AGPL). Mediabunny (MPL-2.0) is what MP4 uses.
- Do not deploy, and do not push or merge into `main`. `npm run deploy:cf`
  touches production; leave it alone.
- Keep GIF exports small by default; larger sizes are opt-in.
- New i18n strings go into both the `zh` and `en` blocks in `lib/i18n.ts`;
  TypeScript enforces parity.
- The animation format is v1 and must stay backward compatible: only add
  optional fields, and omit them when they hold the old default.
