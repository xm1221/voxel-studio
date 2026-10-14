# 部署到 Cloudflare

Pixelstage 会挂在 `https://tools.xm1221.cn/mcrender`。页面、静态资源和 `/api/player` 都走这个前缀。构建用 [OpenNext Cloudflare](https://opennext.js.org/cloudflare) 适配器，跑在 Workers 上，不需要单独再拆一个静态导出。

## 构建

```bash
npm install
NEXT_PUBLIC_BASE_PATH=/mcrender npm run build:cf
```

`NEXT_PUBLIC_BASE_PATH` 必须在构建时就定下来，Next 会把它写进客户端包。本地开发不要设这个变量，站点仍在 `/`。

预览 Workers 运行时：

```bash
NEXT_PUBLIC_BASE_PATH=/mcrender npm run preview:cf
```

正式发布（需要本机已 `wrangler login`，并且账号能创建 Worker `pixelstage`）：

```bash
NEXT_PUBLIC_BASE_PATH=/mcrender npm run deploy:cf
```

本仓库不包含自动发布。`wrangler.jsonc` 里的 Worker 名称是 `pixelstage`。在 Cloudflare 上把 `tools.xm1221.cn/mcrender*` 指到这个 Worker。如果这台域名上已经有别的 Worker，用路由只匹配 `/mcrender` 开头的路径，不要抢走整站。

## 玩家名查询的缓存

`/mcrender/api/player` 会向 Mojang 查 UUID、皮肤和披风，并把 PNG 收成 data URL 返回。

- 成功结果：本机内存 30 分钟，响应头 `s-maxage=1800`，并写入 Workers Cache API。
- 查无此人：缓存 2 分钟，避免同一个错名字反复打 Mojang。
- 限流和上游故障：不缓存。
- 发给 Mojang 的 `fetch` 使用 `revalidate: 1800`，同一 isolate 里不会每次都重新下载皮肤文件。

## 静态资源如果 404

OpenNext 在部分版本里不会自动把 `/_next` 挪到 `basePath` 下面。如果页面能开、但脚本和字体 404，在 `npm run build:cf` 之后执行：

```bash
mkdir -p .open-next/assets/mcrender
find .open-next/assets -mindepth 1 -maxdepth 1 ! -name mcrender -exec mv {} .open-next/assets/mcrender/ \;
```

然后再 `npx opennextjs-cloudflare deploy`（不要再跑一遍会清空 `.open-next` 的 build）。
