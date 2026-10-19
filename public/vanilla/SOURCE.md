# Vanilla textures

The PNGs under `26.3/` are unmodified files from the official Minecraft Java client **26.3**.

- Version manifest: `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json` (`latest.release` = `26.3`)
- Client jar: `https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar`
- Each file keeps the name it has inside that jar, under `assets/minecraft/textures/`.

Nothing here was drawn, traced, or regenerated. Grass block top is the grayscale vanilla texture. The stage multiplies it by the plains color read from `colormap/grass.png` (temperature 0.8, humidity 0.4), which is how the game tints grass. The side texture is the colored file from the same jar.

`block/netherrack.png` is the same jar’s netherrack. The noon, sunset, and night floors use the grass block textures. The nether floor uses netherrack. Those floors stay on these bundled files. A resource pack replaces prop textures only.
