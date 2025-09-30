# 技能五子棋 · Skill Power Gomoku

基于 Vite + React + TypeScript 打造的综艺化五子棋网页游戏，灵感来自热门喜剧节目中的“技能五子棋”。除了传统落子规则，还加入三张技能卡（飞沙走石、力拔山兮、时光倒流），搭配综艺式面板与积分系统，适合线下聚会或直播互动蹭热点。

> 预览站点（GitHub Pages）：<https://4ier.github.io/skilled-fir/>

## 主要特性

- 15×15 棋盘，支持同屏双人轮流对弈。
- 三大技能卡：3×3 清场、摔飞对手最新落子、倒回上一回合。
- 热度积分榜、玩法速记、综艺式提示语与灯光风格 UI。
- 响应式布局，桌面端技能卡横排展示，移动端自动改为单列。
- 打包后可直接托管为静态站点；仓库附带自动部署工作流。

## 本地开发

依赖：Node.js ≥ 20.19（官方推荐，低版本可能触发 Vite warning）。

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 5174
```

开发服务器默认输出为 `http://localhost:5174/`，可根据需要调整端口或 host。

### Lint & 构建

```bash
npm run build   # 产出 dist/ 静态资源
```

如需本地预览构建结果，可加装 `npm install -D serve` 或使用 `npx vite preview`。

## 部署

本仓库已配置 GitHub Pages 自动化发布：

- `main` 分支 push 后，GitHub Actions 会运行 `Deploy static site` 工作流。
- 工作流使用 `npm ci && npm run build` 构建，并将 `dist/` 发布到 `gh-pages` 分支。
- Pages 设置指向 `gh-pages` 分支根路径，最终站点位于 <https://4ier.github.io/skilled-fir/>。

若 fork 后想自行部署：

1. 在仓库 Settings → Pages 选择 `gh-pages` 分支。
2. 确保 `Actions` 标签页的 `Deploy static site` 工作流拥有写入权限（`contents: write`），或根据需要调整。
3. 更新 `vite.config.ts` 中的 `base` 值为你的仓库名，例如 `/your-repo/`。

## 版本

- `v0.1`：首个公开版本，包含棋盘逻辑、技能系统、综艺式 UI 与 GitHub Pages 自动部署。

## 许可证

本项目沿用 Vite 模板默认许可（MIT）。如在节目、直播或商业场景使用，请保留原版权信息并注明来源。欢迎在 Issues 中反馈想法或提交 PR。
