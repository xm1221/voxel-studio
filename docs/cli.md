# pixelstage CLI

The `pixelstage` command edits a project file, checks it, and writes Blender / Blockbench files. A project is JSON:

```json
{ "v": 1, "scene": { "v": 1, "players": [], "props": [] }, "customs": [] }
```

The schema is [`schema/pixelstage.project.schema.json`](../schema/pixelstage.project.schema.json). Stage units match the studio: **16 units = 1 block**. Custom PNG bytes live in `customs[].textures` as data URLs. Share links omit those bytes; this file keeps them.

```bash
node cli/pixelstage.mjs init stage.json
node cli/pixelstage.mjs validate stage.json
node cli/pixelstage.mjs list stone
node cli/pixelstage.mjs add stage.json block:stone
node cli/pixelstage.mjs add stage.json --png icon.png --kind item
node cli/pixelstage.mjs add stage.json --model model.json
node cli/pixelstage.mjs keyframe stage.json --prop o_abc --time 0.5 --rot 0,15,0
node cli/pixelstage.mjs export stage.json --glb scene.glb
node cli/pixelstage.mjs export stage.json --gltf scene.gltf
node cli/pixelstage.mjs export stage.json --bbmodel scene.bbmodel
node cli/pixelstage.mjs import stage.json --bbmodel scene.bbmodel
node cli/pixelstage.mjs import stage.json --glb scene.glb
node cli/pixelstage.mjs render stage.json --out frames --fps 12 --seconds 1 --width 320 --height 180
```

`validate` prints one error per problem, with a JSON pointer such as `/scene/players` or `/customs/0/textures/sprite`.

`list` reads `public/vanilla/catalog.json` when that file is present and otherwise prints the built-in shelf of 17 props. Generated catalog data is loaded through `lib/catalog.ts`; the CLI does not bake it.

`export --gltf` writes `scene.gltf` plus a sibling `.bin`. `export --glb` is one file. Both use node animation (translation, rotation, scale) on a node named with the prop id, embed PNG bytes, and set the sampler to nearest (`9728`). A player node is included as a locator. The skin stays in Pixelstage.

`export --bbmodel` writes elements, one group per prop (the group uuid is the prop id), embedded PNGs, and the prop clip as a Blockbench animation. `import --bbmodel` reads those animation keys back onto the timeline. `import --glb` / `--gltf` reads the node animation the exporter wrote.

`render` opens the studio engine in headless Chrome at `--url` (default `http://127.0.0.1:3000/render`) and writes PNG frames plus `render.gif`, `render.mp4`, and `render.webm` via ffmpeg. Pass `--png-only` to skip the movies. Chrome is `CHROME_PATH` or `/usr/local/bin/google-chrome`. The dev server has to be running so the page can load.

## Studio

The props panel exports the same glTF (as `.glb`) and `.bbmodel`, and imports a `.bbmodel` or `.glb` animation onto the prop timeline.
