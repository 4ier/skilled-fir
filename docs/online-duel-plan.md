# 零成本在线对弈方案草案

> 2025-09-30 更新：当前前端实现采用 Supabase Realtime 纯频道广播（无数据库表）来同步房间/棋盘，并通过匿名登录维持会话。若需要持久化记录，可参考本文后续的数据库方案进一步扩展。

## 目标

在保留 GitHub Pages 静态托管的前提下，实现通过邀请码创建/加入棋盘的实时对弈功能；尽量利用免费额度，不增加服务器运维成本。

## 架构概览

- **前端**：现有 Vite/React 应用，继续部署在 GitHub Pages。
- **实时通道**：Supabase Realtime（Edge Channels + Presence），使用匿名会话直接订阅/广播，不依赖数据库。
- **安全**：匿名登录（Supabase Auth 的 `anon` key），以及频道命名基于邀请码可控的 4 位 code。
- **可扩展**：若后续要持久化房间/落子，可按文末数据库方案接入 Postgres。

## 实现步骤（当前版本）

1. **创建 Supabase 项目**
   - 注册 supabase.com，创建免费项目，记录 `Project URL` 与 `anon` 公钥。
   - 在 Authentication → Providers 中启用 *Anonymous Sign-In*（Beta）。

2. **配置 Realtime**
   - 在 Settings → Realtime 中启用 `Realtime Enabled`，允许匿名用户订阅。
   - 无需创建表；频道命名为 `room:{code}`，使用 `supabase.channel` 直接广播。

3. **前端逻辑**
   - 启动时调用 `supabase.auth.signInAnonymously()` 获取会话 ID。
   - 房主生成 4 位邀请码并选择执子颜色，订阅频道后发送首个 `snapshot`。
   - 客人加入频道后发送 `join-request`，房主在收到后回复完整 `snapshot`（包含双方昵称、棋盘状态、就绪标记等）。
   - 双方的操作（就绪、落子、技能）均先更新本地状态，再通过 `snapshot` 广播给频道内所有成员。

4. **昵称与邀请码**
   - `src/utils/random.ts` 提供 `createInviteCode()` 与 `randomFunnyName()`，确保邀请码仅由 4 位不易混淆字符组成，昵称为搞笑前后缀组合。

5. **就绪/开局机制**
   - 双方在 `lobby` 状态下点击“我已就绪”，房主收到 `snapshot` 后若检测双方就绪即重置棋盘并切换 `status='playing'`，黑子固定先手。

6. **技能同步**
   - 所有技能效果均更新在 `GameState` 中；房主或客人触发技能后将新的状态通过 `snapshot` 广播给对方，保持一致性。

7. **环境变量配置**
   - `.env.example` 列出 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`。
   - GitHub Pages workflow 从仓库 Secrets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 注入构建环境。

8. **成本控制**
   - Supabase Realtime 免费额度足够小规模使用；若并发增大，可升级套餐或迁移至自建 realtime-server。

## 后续扩展（持久化版本）

若需要断线重连、战绩统计、外挂防护，可借助 Postgres + RLS 策略：

- 建立 `rooms`、`moves` 表并启用 RLS（同本文旧方案）。
- 落子时写入 `moves`，并使用 `postgres_changes` 推送事件。
- 断线重连时读取历史序列重播，支持观战模式等。

## 待办清单

1. 在 Supabase 控制台开启匿名登录与 Realtime。
2. 验证两端浏览器同时加入、就绪、落子能否实时同步。
3. 视需求决定是否接入数据库存储长期记录。
