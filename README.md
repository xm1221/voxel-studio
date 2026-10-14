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

- Up to 4 players. Each one has their own pose, clip, speed, position, and scale.
- On a phone the controls sit in a drawer; on a desktop they stay in the side panel.
- Backgrounds: studio, noon, sunset, night, nether, or transparent. You can also upload a PNG, JPG, or WebP (cover or contain). The contact shadow stays.
- Export PNG (including a transparent PNG) and GIF. Sizes: avatar, square, Xiaohongshu, YouTube, story, desktop, banner, and 4K.
- Share links carry the pose, motion, lights, and camera. Uploaded skins and background images stay in this browser.
- Capes from the account can be turned off.
- Elbows and knees, a flat or voxel outer layer, nametags and speech bubbles, and soft / hard / neon / moon light.
- The interface is Chinese or English. The 中 / EN control in the top bar is saved in this browser. With nothing saved, a `zh` locale stays in Chinese and every other language starts in English.

## 怎么用 / How to use

1. 顶部输入 Java 版玩家名，或上传 64×64（也支持旧的 64×32）PNG。也可以直接用 Steve / Alex。
2. 「场景」里换地面和天空，或上传一张背景图。图片太大时会缩到长边 1920。
3. 选一个姿势，再用关节滑块改肘和膝。摆乱了按「恢复默认」：当前这个人回到站立、呼吸、速度 1、原点、缩放 1，名牌和气泡清空。皮肤还在。
4. 「恢复场景」把灯光、调色、描边、体积光和背景（含上传的图）收回默认棚拍。
5. 「动作」里可以静止、呼吸、行走、跑步、挥手或欢呼。
6. 拖拽旋转，滚轮或双指缩放。头像用「头像机位」。「移动角色」在地面上拖当前这个人。
7. 选一个尺寸后下载 PNG，或导出同比例的 GIF。透明 PNG 不带背景图。
8. 「复制链接」分享姿势和机位。对方看不到你上传的皮肤和背景图。

1. Enter a Java Edition name, or upload a 64×64 PNG (legacy 64×32 works too). Steve and Alex are built in.
2. Use 场景 to switch the ground and sky, or upload a background. Large images are scaled so the long edge is 1920px.
3. Pick a pose, then move the elbows and knees. 恢复默认 puts the active player back on the idle pose, the idle clip, speed 1, the origin, and scale 1, and clears the nametag and bubble. The skin stays.
4. 恢复场景 resets lights, grade, outline, godrays, and the background, including an uploaded image, to the studio default.
5. Clips: still, idle, walk, run, wave, cheer.
6. Drag to orbit, scroll or pinch to zoom. 头像机位 frames the head. 移动角色 drags the active player on the ground.
7. Pick a size and download a PNG, or export a GIF at the same ratio. A transparent PNG does not include the background image.
8. 复制链接 shares the pose and camera. The other person will not see an uploaded skin or background image.

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
