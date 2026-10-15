# 部署到 Cloudflare

Pixelstage 会挂在 `https://tools.xm1221.cn/mcrender`。页面、静态资源和 `/api/player` 都走这个前缀。构建用 [OpenNext Cloudflare](https://opennext.js.org/cloudflare) 适配器，跑在 Workers 上，不需要单独再拆一个静态导出。

## 环境

需要 Node.js 22。Wrangler 4 在更旧的 Node 上起不来。仓库根目录的 `.nvmrc` 和 `package.json` 里的 `engines.node` 都是 22。

`next` 和 `eslint-config-next` 固定在 `16.3.8`，不要装 `^` 范围。Next 16.4.0 在 Workers 上会在 `loadManifest` 读 `preview-props.json` 时失败。

`next.config.ts` 不要打开 `cacheComponents` 和 `partialPrefetching`。这两个开关在 Workers 上会让页面一直挂起。

## 构建

线上路径是 `/mcrender`。**构建时必须带上 `NEXT_PUBLIC_BASE_PATH=/mcrender`。** 漏了的话，页面、`/_next` 和 `/api/player` 都会去根路径找文件，`https://tools.xm1221.cn/mcrender` 整站 404。Next 在构建时就把这个值写进客户端包，部署之后再改环境变量来不及。

仓库里已经接了三道，避免再漏：

1. [`.env.production`](.env.production) 写着 `NEXT_PUBLIC_BASE_PATH=/mcrender`。`next build` 会读它。`next dev` 不读，本地仍是 `/`。
2. `package.json` 里的 `build:cf`、`preview:cf`、`deploy:cf` 也会自己带上这个变量。
3. `next.config.ts` 在生产构建里如果发现变量没设，会退回 `/mcrender`。要故意打一个挂在 `/` 的生产包，把 `NEXT_PUBLIC_BASE_PATH` 设成空字符串。

```bash
npm install
npm run build:cf
```

预览 Workers 运行时：

```bash
npm run preview:cf
```

正式发布（需要本机已 `wrangler login`，并且账号能创建 Worker `pixelstage`）：

```bash
npm run deploy:cf
```

`main` 分支收到 push 后，GitHub Actions 会运行 [`.github/workflows/deploy-main.yml`](.github/workflows/deploy-main.yml)，执行 `npm ci` 和 `npm run deploy:cf` 自动发布。仓库需要在 GitHub Actions secrets 中配置：

- `CLOUDFLARE_API_TOKEN`：允许部署 Worker `pixelstage`
- `CLOUDFLARE_ACCOUNT_ID`：Worker 所在账号的 ID

`wrangler.jsonc` 里的 Worker 名称是 `pixelstage`。在 Cloudflare 上把 `tools.xm1221.cn/mcrender*` 指到这个 Worker。如果这台域名上已经有别的 Worker，用路由只匹配 `/mcrender` 开头的路径，不要抢走整站。

## 玩家名查询的缓存

`/mcrender/api/player` 先向 `api.minecraftservices.com` 查玩家，再向会话服务器要皮肤属性。Workers 出去访问这些 Mojang 接口经常拿到 403，这时改查 `playerdb.co`（同一个纹理属性）。皮肤和披风的 PNG 仍然从 `textures.minecraft.net` 下载，其它域名直接拒绝。Mojang 有时给出 `http://textures.minecraft.net/...`，下载前会先改成 https。结果收成 data URL 返回。

- 成功结果：本机内存 30 分钟，响应头 `s-maxage=1800`，并写入 Workers Cache API。
- 查无此人：缓存 2 分钟，避免同一个错名字反复打上游。
- 限流和上游故障：不缓存。
- 出站 `fetch` 带 `cf.cacheTtl: 1800` 和 `cacheEverything`，由 Workers 缓存 Mojang、playerdb 和皮肤文件。Node 本地的 `fetch` 会忽略 `cf`。

## 静态资源如果 404

OpenNext 在部分版本里不会自动把 `/_next` 挪到 `basePath` 下面。如果页面能开、但脚本和字体 404，在 `npm run build:cf` 之后执行：

```bash
mkdir -p .open-next/assets/mcrender
find .open-next/assets -mindepth 1 -maxdepth 1 ! -name mcrender -exec mv {} .open-next/assets/mcrender/ \;
```

然后再 `npx opennextjs-cloudflare deploy`（不要再跑一遍会清空 `.open-next` 的 build）。
