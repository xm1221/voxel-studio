# Pixelstage

浏览器里的 Minecraft 皮肤渲染台。输入玩家名或放进一张皮肤，摆姿势、打灯、换背景，导出 PNG 或 GIF。不用账号，画面上没有水印。

A Minecraft skin stage in the browser. Look up a player or drop in a skin, pose them, light the shot, change the background, and export a PNG or GIF. No account, no watermark.

**线上 / Live:** [https://tools.xm1221.cn/mcrender](https://tools.xm1221.cn/mcrender)

## 功能 / Features

- 最多 4 个人。每人单独的姿势、动作、速度、位置和缩放。
- 手机上控制收进抽屉，桌面则在右侧面板。
- 场景：棚拍、正午、黄昏、夜晚、下界、透明。也可以上传 PNG / JPG / WebP 当背景（铺满或完整），脚下留着影子。
- 导出 PNG（含透明）和 GIF。尺寸有头像、方图、小红书、YouTube、竖屏、桌面、横幅和 4K。
- 分享链接带上姿势、动作、灯光和机位。上传的皮肤和背景图只留在这台浏览器里。
- 正版披风会跟着账号下来，可以关掉。
- 关节含肘和膝，外层可以是平面或 3D。名牌和气泡，柔光 / 硬光 / 霓虹 / 月光。
- 界面可以切中文或英文。右上角的「中 / EN」会记在这台浏览器里；没选过时，语言以 `zh` 开头用中文，否则用英文。
- 动作可以导入、导出关键帧动画 JSON。格式见下面的「动画 JSON」。

- Up to 4 players. Each one has their own pose, clip, speed, position, and scale.
- On a phone the controls sit in a drawer; on a desktop they stay in the side panel.
- Backgrounds: studio, noon, sunset, night, nether, or transparent. You can also upload a PNG, JPG, or WebP (cover or contain). The contact shadow stays.
- Export PNG (including a transparent PNG) and GIF. Sizes: avatar, square, Xiaohongshu, YouTube, story, desktop, banner, and 4K.
- Share links carry the pose, motion, lights, and camera. Uploaded skins and background images stay in this browser.
- Capes from the account can be turned off.
- Elbows and knees, a flat or voxel outer layer, nametags and speech bubbles, and soft / hard / neon / moon light.
- The interface is Chinese or English. The 中 / EN control in the top bar is saved in this browser. With nothing saved, a `zh` locale stays in Chinese and every other language starts in English.
- Motion can be imported and exported as keyframe animation JSON. The format is under Animation JSON below.

## 怎么用 / How to use

1. 顶部输入 Java 版玩家名，或上传 64×64（也支持旧的 64×32）PNG。也可以直接用 Steve / Alex。
2. 「场景」里换地面和天空，或上传一张背景图。图片太大时会缩到长边 1920。
3. 选一个姿势，再用关节滑块改肘和膝。摆乱了按「恢复默认」：当前这个人回到站立、呼吸、速度 1、原点、缩放 1，名牌、气泡和自定义动画都清空。皮肤还在。
4. 「恢复场景」把灯光、调色、描边、体积光和背景（含上传的图）收回默认棚拍。
5. 「动作」里可以静止、呼吸、行走、跑步、挥手或欢呼，也可以导入一份关键帧动画 JSON。格式见下方「动画 JSON」。
6. 拖拽旋转，滚轮或双指缩放。头像用「头像机位」。「移动角色」在地面上拖当前这个人。
7. 选一个尺寸后下载 PNG，或导出同比例的 GIF。透明 PNG 不带背景图。
8. 「复制链接」分享姿势和机位。对方看不到你上传的皮肤和背景图。

1. Enter a Java Edition name, or upload a 64×64 PNG (legacy 64×32 works too). Steve and Alex are built in.
2. Use 场景 to switch the ground and sky, or upload a background. Large images are scaled so the long edge is 1920px.
3. Pick a pose, then move the elbows and knees. 恢复默认 puts the active player back on the idle pose, the idle clip, speed 1, the origin, and scale 1, and clears the nametag, bubble, and custom animation. The skin stays.
4. 恢复场景 resets lights, grade, outline, godrays, and the background, including an uploaded image, to the studio default.
5. Clips: still, idle, walk, run, wave, cheer. You can also import a keyframe animation JSON. The format is under Animation JSON below.
6. Drag to orbit, scroll or pinch to zoom. 头像机位 frames the head. 移动角色 drags the active player on the ground.
7. Pick a size and download a PNG, or export a GIF at the same ratio. A transparent PNG does not include the background image.
8. 复制链接 shares the pose and camera. The other person will not see an uploaded skin or background image.

## 动画 JSON / Animation JSON

「导出动画」下载当前这个人的自定义动画。如果正在播的是内置动作，下载的是那套动作烘焙出来的 JSON，不是滑块上的姿势。「导入动画」读一个 `.json` 文件；也可以把 JSON 贴进「动画 JSON」再按「粘贴导入」。导入只改当前选中的人，并切到以该动画命名的自定义动作。每个人各自一份。分享链接和这台浏览器的本地保存都会带上它。「恢复默认」会清掉。

Export animation downloads the active player’s custom animation. If a built-in clip is playing, the download is that clip baked to JSON, not the slider pose. Import animation reads a `.json` file. You can also paste JSON into Animation JSON and press Import paste. Import applies to the selected player only and switches them to a custom clip named from the file. Each player has their own. Share links and this browser’s save both keep it. Reset clears it.

播放速度仍用「慢 / 正常 / 快」（0.65×、1×、1.45×）。文件里的 `duration` 是 1× 时的秒数。GIF 会把这段时长收成 12–28 帧。

The slow / normal / fast buttons still scale playback (0.65×, 1×, 1.45×). `duration` in the file is the length in seconds at 1×. GIF export resamples that span to 12–28 frames.

### 字段 / Fields

顶层只能有这些字段，多一个都会被拒绝。版本必须是数字 `1`。

The top level allows only these fields. Any other field is rejected. The version must be the number `1`.

| 字段 / Field | 类型 / Type | 规则 / Rule |
| --- | --- | --- |
| `v` | `1` | 只能是数字 `1`。Must be the number `1`. |
| `name` | string | 去掉首尾空白后 1–48 个字符。1–48 characters after trim. |
| `duration` | number | 秒，0.2–30。Seconds, from 0.2 to 30. |
| `loop` | boolean | 只能是 `true` 或 `false`，不能写 `1` / `0`。`true` or `false` only, not `1` or `0`. |
| `keyframes` | array | 1–240 个。按 `time` 严格递增，不会自动排序。1–240 items, strictly increasing `time`. They are not sorted for you. |

每个关键帧只能有 `time`、`joints`、`bob`、`sway`、`roll`、`cape`。没有缓动字段，两帧之间固定用 smoothstep（慢入慢出），不是线性。

Each keyframe allows only `time`, `joints`, `bob`, `sway`, `roll`, and `cape`. There is no easing field. Segments use smoothstep, not linear interpolation.

| 字段 / Field | 规则 / Rule |
| --- | --- |
| `time` | 数字，`0` 到 `duration`（含两端），并且比上一帧大。A number from `0` through `duration`, greater than the previous frame. |
| `joints` | 必填对象，可以是 `{}`。缺的关节用这个人当前滑块姿势，不是 0。Required object. It may be `{}`. Omitted joints use that player’s current slider pose, not 0. |
| `bob` | 可选，默认 0，范围 −8–8。上下浮动。Optional, default 0, from −8 to 8. Vertical bob. |
| `sway` | 可选，默认 0，范围 −5–5。左右晃。Optional, default 0, from −5 to 5. |
| `roll` | 可选，默认 0，范围 −5–5。侧倾。Optional, default 0, from −5 to 5. |
| `cape` | 可选，默认 0，范围 −45–45。披风摆动（度）。Optional, default 0, from −45 to 45. Cape swing in degrees. |

关节角度和滑块是同一套范围。未知关节名（含 `constructor`、`__proto__`）会整份拒绝。

Joint angles use the same ranges as the sliders. Unknown joint names, including `constructor` and `__proto__`, reject the whole file.

| 关节 / Joint | 最小 / Min | 最大 / Max |
| --- | --- | --- |
| `headX` 头俯仰 / head pitch | −40 | 40 |
| `headY` 头转向 / head turn | −55 | 55 |
| `bodyX` 身体 / body | −30 | 30 |
| `rArmX` `lArmX` 肩前后 / shoulder swing | −170 | 170 |
| `rArmZ` 右臂张开 / right arm out | −180 | 40 |
| `lArmZ` 左臂张开 / left arm out | −40 | 180 |
| `rElbow` `lElbow` 肘 / elbow | −150 | 30 |
| `rLegX` `lLegX` 髋 / hip | −120 | 70 |
| `rKnee` `lKnee` 膝 / knee | −15 | 150 |

### 最小例子 / Minimal example

循环一圈时，`time: 0` 和 `time: duration` 是同一瞬间。下面让第一帧和最后一帧姿势相同，这样循环不会跳一下。

On a loop, `time: 0` and `time: duration` are the same instant. The first and last poses match here so the cycle does not pop.

```json
{
  "v": 1,
  "name": "Wave",
  "duration": 1.6,
  "loop": true,
  "keyframes": [
    { "time": 0, "joints": { "rArmZ": -20, "rElbow": -10 } },
    { "time": 0.8, "joints": { "rArmZ": -150, "rElbow": -70 }, "cape": 6 },
    { "time": 1.6, "joints": { "rArmZ": -20, "rElbow": -10 } }
  ]
}
```

只写了右臂和披风。头、左臂和腿会跟着当前滑块走。`loop: false` 时，时间走到最后一帧就停住；只有一帧时整段都停在那一帧。

Only the right arm and the cape are keyed. The head, left arm, and legs follow the current sliders. With `loop: false`, playback holds the last keyframe. A single keyframe holds that pose the whole time.

### 容易写错的地方 / Pitfalls

- `keyframes` 不能是空数组，至少要有一帧。`keyframes` cannot be an empty array. At least one keyframe is required.
- `time` 不要超过 `duration`，也不要相等或倒序。`time` cannot pass `duration`, and ties or a decreasing order are rejected.
- 某一帧写了 `rArmX`、下一帧没写，中间会从这一帧的角度缓回当前滑块，看起来像手自己收回去。If one keyframe sets `rArmX` and the next omits it, the arm eases from that angle back to the slider pose.
- 想要无缝循环，要么让 `time: 0` 和 `time: duration` 的姿势一样，要么不要把最后一帧放在 `duration` 上，让它从最后一帧缓回第一帧。For a seamless loop, match the poses at `time: 0` and `time: duration`, or leave the last keyframe before `duration` so playback eases from the last keyframe back to the first.
- 导出内置动作（行走、跑步等）时，关节是按站立姿势烘焙出来的，不是按你现在的滑块。33 帧（静止是 1 帧）。名字跟当前界面语言走。导出「静止」只是一个姿势，不是 GIF 里那种转一圈。Exporting a built-in clip (walk, run, and the others) bakes joints from the idle pose, not from your sliders. That is 33 frames, or 1 frame for still. The name follows the current UI language. Exporting still is one pose, not the GIF turntable.
- 画面上的跑步会把髋甩到 ±72°，滑块上限是 70。导出的 JSON 会收到 70，再导入时峰值会少大约 2°。The on-screen run swings the hips to ±72°. The slider max is 70, so the exported JSON is clamped to 70 and a re-import peaks about 2° lower.
- 整段文字超过 512KB 会在解析前被拒绝。Text over 512KB is rejected before it is parsed.

## 本地运行 / Run locally

需要 Node.js 22 或更新。`next` 固定在 `16.3.8`。

Node.js 22 or newer. `next` stays pinned at `16.3.8`.

```bash
npm install
npm run dev -- --port 38471
```

打开 [http://127.0.0.1:38471](http://127.0.0.1:38471)。开发模式没有 `/mcrender` 前缀。

Open [http://127.0.0.1:38471](http://127.0.0.1:38471). Dev mode is not prefixed with `/mcrender`.

```bash
npm test
npm run build
npm start
```

`npm run build` 会读 [`.env.production`](.env.production)，生产包挂在 `/mcrender`。本地预览打开 [http://127.0.0.1:3000/mcrender](http://127.0.0.1:3000/mcrender)。

`npm run build` reads [`.env.production`](.env.production), so the production app is served under `/mcrender`. Locally that is [http://127.0.0.1:3000/mcrender](http://127.0.0.1:3000/mcrender).

## 部署 / Deploy

生产环境挂在 `https://tools.xm1221.cn/mcrender`。Cloudflare Workers 的步骤、以及为什么必须设置 `NEXT_PUBLIC_BASE_PATH=/mcrender`，写在 [DEPLOY.md](DEPLOY.md)。`npm run deploy:cf` 已经带上这个变量。

Production is `https://tools.xm1221.cn/mcrender`. Cloudflare Workers steps, and why `NEXT_PUBLIC_BASE_PATH=/mcrender` has to be set at build time, are in [DEPLOY.md](DEPLOY.md). `npm run deploy:cf` sets it.

## 许可 / License

本仓库以 [MIT License](LICENSE) 发布。

This repository is [MIT](LICENSE).

皮肤 UV、旧版 64×32 补全和细臂判断参照了 [skinview3d](https://github.com/bs-community/skinview3d) 与 skinview-utils（同样是 MIT）。行走和跑步的四肢相位也按它的循环来，肘和膝会在后摆时多弯一截。这不是 Mojang 或微软的官方产品。

Skin UVs, the legacy 64×32 upgrade, and slim-arm detection follow [skinview3d](https://github.com/bs-community/skinview3d) and skinview-utils (also MIT). Walk and run use that cycle, with extra bend at the elbow and knee on the backswing. This is not an official Mojang or Microsoft product.
