# 减脂笔记

单人、本地优先的减脂追踪网页应用（可添加到手机主屏幕）。对照常见表格字段记录每一天：空腹体重、肚脐腰围、昨日步数、力量训练、有氧、蛋白粉、早/中/晚/额外、总摄入、手环消耗和热缺。

数据默认只存在当前浏览器的 `localStorage`，离线可用。可选开启 **GitHub Gist 云同步**，在多台设备之间按记录合并（不是整份覆盖）。

## 能做什么

- **今日**：按天填写和表格相同的字段；总摄入自动 = 早 + 中 + 晚 + 额外。
- **热缺** = **BMR + 手环消耗 − 重叠扣减 − 饮食总摄入**。正数为缺口（减脂）。今日页只显示结果，不展开计算式。
  - **A BMR + 手环 − 重叠扣减**（默认）：BMR 默认 1630，重叠扣减默认 150（在公式里减去）。改一次即成为之后新记录的默认。旧版「每日额外消耗」会迁成重叠扣减 150，不再做加法。
  - **B 固定 TDEE**：热缺 = 设置里的 TDEE − 饮食总摄入。
- 同时显示 **总摄入 vs 目标**（默认目标 2000 大卡，建议 1900–2100）以及 vs 消耗。
- **训练**：推 / 拉 / 腿（凯圣王×谭成义三分化，护腰默认：腿日用高脚杯深蹲）。每个训练日最前面是热身（勾选即可，无 90 秒组间休息），然后才是正式动作。正式组可记每组重量，下次开练会带出「上次 xxkg」。设置或训练页可「恢复谭式默认模板」。
- **日志**：表格视图（列顺序与原表一致）和卡片列表，点一行即可改那天。
- **趋势**：
  - 双轴图：左轴空腹体重（柱）+ 肚脐腰围（线），右轴热缺（虚线）
  - 体重变化折线，可选线性趋势线
  - 可选 7 日滚动平均；区间 7 / 14 / 28 / 90 天
- **设置**：目标热量、TDEE（默认 2300）、蛋白质目标备忘、云同步、导出/导入 JSON、清空数据。设置里也可「填入示例数据」预览图表，再清掉换成自己的记录。

## 本地运行

需要 Node.js 18+。

```bash
npm install
npm run dev
```

浏览器打开终端里提示的地址（默认 `http://127.0.0.1:45321`）。本地和隧道预览的 Vite `base` 是 `/`，不要设置 `VITE_BASE`。

```bash
npm test
```

会跑旧数据迁移 / 白屏防护，以及两台设备的 Gist 合并（内存 mock，不需要真 token）。

## 生产构建

```bash
npm run build
npm run preview
```

`preview` 同样使用 `45321` 端口。部署到 GitHub Pages 时必须带上仓库子路径：

```bash
VITE_BASE=/tan-fitness/ npm run build
```

构建会把 `dist/index.html` 复制为 `dist/404.html`（项目站点刷新不 404），并写入 `dist/.nojekyll`。manifest 的 `start_url` / `scope` 以及 Service Worker 都跟着 `base` 走。

## GitHub Pages

目标地址：`https://destrey-str.github.io/tan-fitness/`。

1. 把本仓库放到 GitHub，仓库名为 `tan-fitness`（Pages 项目路径 `/tan-fitness/`）。
2. 仓库 **Settings → Pages → Source** 选 **GitHub Actions**。
3. 推送到 `main` 后，`.github/workflows/pages.yml` 会 `npm test`、用 `VITE_BASE=/tan-fitness/` 构建并发布。

## 云同步（GitHub Gist）

纯前端，没有自建后端。设置 → **云同步**：

1. 创建一个 GitHub Personal Access Token，**只需 gist 权限**（classic 勾 `gist`，或 fine-grained 给 Gists 读写）。
2. 把 token 填进设置。只存在本机 `localStorage`，**不会**写进源码、Gist 的 `data.json`，也不会出现在导出 JSON 里。
3. 首次启用会查找该账号下 description 为 `jianzhi-notes-sync` 的 **私密** gist；没有就新建一个，文件名 `data.json`。也可以手动填 gist ID。
4. 本地照常写入；有网时在启动、回到前台、点「立即同步」时先拉取再合并；改动后约 4 秒防抖推送。
5. 合并按天、按训练记录带 `updatedAt`，取较新的；删除用 tombstone，避免另一台设备的数据被整份覆盖。BMR、重叠扣减、组间休息、训练模板等设置也会同步。
6. 第一次两边都有数据时是合并，不是覆盖。
7. 状态行显示上次同步时间 / 同步中 / 失败。网络不通不会弹窗，稍后自动重试。

导出/导入 JSON 仍然可用，用来做文件备份。关掉云同步只会清掉本机 token，GitHub 上的 gist 还在。

## 添加到 iPhone 主屏幕（推荐，可离线）

必须用 **Safari**（不要用微信内置浏览器或 Chrome）：

1. 用 Safari 打开本应用的 **https** 地址，等页面完整加载一次（让离线缓存装好）。
2. 点底部分享按钮（方框加箭头）→ **添加到主屏幕** → 添加。
3. 以后从主屏幕图标打开即可全屏使用。饮食、训练记录存在本机；开启云同步后可在其他设备合并。
4. 临时网页链接过期后，只要曾经成功加载过，主屏幕应用仍可离线打开已缓存的页面。建议在设置里定期 **导出 JSON** 备份。

Android Chrome：菜单 → **安装应用** / **添加到主屏幕**。

开发模式（`npm run dev`）的服务工作者不完整，请用 `npm run build && npm run preview` 或已部署的 https 地址安装。

## 数据备份

设置页可导出全部 localStorage 为 JSON（不含 GitHub token）。iPhone Safari 会打开分享面板，可选「存储到文件」；也可复制 JSON 文本。导入前选择 **覆盖**（替换本机全部数据）或 **合并**（按日期 / 训练 id 补进，同一条以导入为准）。也支持粘贴 JSON 文本。

## 技术

Vite + React + TypeScript + Tailwind CSS + Recharts。图表与日志表格按常见健身追踪表的列和双轴图风格排版。
