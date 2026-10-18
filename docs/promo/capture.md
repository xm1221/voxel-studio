# Pixelstage promo capture

Short screen recordings for the timeline and the prop stage. Record the live app at `http://localhost:3000` (production is `https://tools.xm1221.cn/mcrender`). Use a 1920×1080 window, 30 fps, no browser chrome if the recorder allows it. Keep the cursor slow. Each cut is about 4–6 seconds. Total runtime about 30 seconds.

Do one pass in 中文 and one pass in English. Switch with the 中 / EN control before rolling. Do not cover the stage with the mouse.

## Setup (both languages)

1. Open the app. Steve is already on the studio floor, idle.
2. In 场景 / Scene, leave the background on 棚拍 / studio, light on 柔光 / Soft, grade on 干净 / Clean.
3. Frame the body with 全身机位 / Frame body. Orbit until Steve is three-quarter, slightly left of center, so the right side of the floor stays empty for props.

## Shot list

| # | What to do | 中文字幕 | English caption |
| --- | --- | --- | --- |
| 1 | Hold on Steve. No clicks for 2 seconds. | 浏览器里的 Minecraft 皮肤舞台 | A Minecraft skin stage in the browser |
| 2 | Open 动作 / Motion. Press 挥手示范 / Wave starter. Let the arm swing once. | 不用写 JSON，直接摆关键帧 | Keyframes, without writing JSON |
| 3 | Drag the middle diamond along the timeline. The arm follows. | 拖一帧，手臂跟着走 | Drag a key. The arm follows |
| 4 | Open 道具 / Props. Add grass, a crafting table, a torch, and a creeper. | 方块、物品、生物，站在同一舞台 | Blocks, items, and mobs on the same stage |
| 5 | Select the creeper. Turn on 移动角色 / Move. Drag it beside Steve. | 选中，拖到角色旁边 | Select it and drag it over |
| 6 | Press 下载 / Download. Cut as the PNG saves. Then press 导出 GIF / Export GIF and let the wave loop once. | 姿势、道具，一起进 PNG 和 GIF | The pose and the props, in the PNG and the GIF |

## Voiceover

Speak under the captions, one line per shot. Leave a short breath between lines. Do not read the button names twice if the caption already says them.

中文：

1. 这是 Pixelstage，在浏览器里摆 Minecraft 皮肤。
2. 动作不用再贴 JSON。点一下，就有一段挥手。
3. 关键帧可以拖。曲线告诉你这只手怎么动。
4. 方块、火把、苦力怕，都能放进同一张画面。
5. 选中就能拖。高度和转向在滑块上。
6. 下载 PNG，或者导出一段 GIF。链接里也会带上这些道具。

English:

1. This is Pixelstage, a Minecraft skin stage in the browser.
2. One click starts a wave. The timeline is the animation.
3. Drag a keyframe. The curve is how that arm moves.
4. Blocks, a torch, a creeper — they share the stage with the skin.
5. Select a prop and drag it. Height and turn sit on the sliders.
6. Download a PNG, or export a GIF. Share links carry the props too.

## Still frames

Grab a PNG from the app after shot 5, at the YouTube size, and name them:

- `docs/promo/frames/stage-zh.png` — UI language 中文, creeper and grass in frame, timeline not required.
- `docs/promo/frames/stage-en.png` — same stage after switching to EN. The 3D scene can stay; only the panel language changes.

If a recording is enough, the stills can be single frames exported from the video at shot 5. The app’s own Download button is the cleaner still: it has no panel, which is what you want as a poster beside the recording of the UI.

## What not to claim

The clip is the built-in prop set (blocks, a sword, a pickaxe, an apple, a torch, a creeper, a pig, a chicken, a slime). It is not a full Minecraft model import. Animation files are still version 1.
