# Pixelstage

浏览器里的 Minecraft 皮肤渲染台。输入玩家名或丢进一张皮肤 PNG，摆好带肘、膝的姿势，打一盏棚灯，导出头像、封面或壁纸。

不用账号，画面上没有水印。皮肤通过服务端向 Mojang 查询，再在你自己的显卡上画出来。

## 本地运行

```bash
npm install
npm run dev -- --port 38471
```

打开 [http://127.0.0.1:38471](http://127.0.0.1:38471)。生产构建：

```bash
npm run build
npm start
```

## 怎么用

1. 顶部输入 Java 版玩家名，或上传 64×64（也支持旧的 64×32）PNG。
2. 选一个姿势，再用关节滑块改肘和膝。
3. 拖拽旋转，滚轮缩放。头像用「头像机位」。
4. 选尺寸后下载。透明 PNG 会留下地面上的影子。
5. 「复制链接」带上姿势、灯光和机位。上传的皮肤只留在这台浏览器里。

最多四个人同时站在场景里。正版披风会跟着账号一起下来。

## 许可

本仓库以 [MIT License](LICENSE) 发布。

皮肤 UV、旧版 64×32 补全和细臂判断参照了 [skinview3d](https://github.com/bs-community/skinview3d) 与 skinview-utils（同样是 MIT）。这不是 Mojang 或微软的官方产品。
