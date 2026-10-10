# 重构重做设计：Gamified Self-Tracker

日期：2026-10-10
状态：已批准（用户确认方向：在现有代码上重构改进 + 方案 A 事件派生）

## 背景与目标

当前代码为 2026-05-12 提交的 MVP，75 个测试全部通过，工程健康。但存在结构性问题需要「重做」：

1. **双路径不一致风险**：`toggleCheckIn` 增量更新 streak/XP，`nightly-job` 独立消费冻结/断签，两套逻辑并存（spec 003 已标注重复消耗风险）。
2. **LEGACY 代码**：`streak-engine.ts` 中 `evaluateStreakState`（旧 per-habit 逻辑）与新全局逻辑并存。
3. **空占位**：`packages/analytics` 是空目录；`tests/{e2e,integration,unit}` 无任何测试。
4. **功能缺口**：无习惯编辑/删除/归档入口（数据模型有 `archived_at` 但 UI 无入口）；无备份导出；analytics 未真正接入。

**目标**：以「checkIns 为唯一事实源」的派生架构重构核心状态逻辑，补齐 4 个缺口功能，保持产品行为不回归。

## 全局决策（来自澄清问答）

- 重做方式：**在现有代码上重构改进**，不换技术栈、不推翻架构分层（domain → storage → ui）。
- 本轮范围：**核心重构 + 缺口功能**（习惯编辑/归档/删除、备份导出 JSON、E2E 测试、analytics 包）。UI 视觉打磨不在此轮。
- 状态模型基调：**方案 A 事件派生**（checkIns 为唯一事实源，streaks/userStats 为派生缓存）。
- 删除语义：**编辑（改名）+ 归档（保留历史数据与统计，从每日列表隐藏）+ 彻底删除**（二次确认后移除习惯及其打卡记录）。

## 设计段 1：领域层（domain）

### 保持不变
- `date-engine.ts`（04:00 逻辑日、日期差、周一判定）
- `scoring-engine.ts`（XP 公式、等级计算）
- `streak-engine.ts` 中的 `evaluateLogicalDay`（逻辑日评估）

### 新增 `derive-engine.ts`（全部纯函数，参数化测试）
- `deriveTotalXP(checkIns): number` —— `Σ awarded_xp`，XP 恒等于打卡总和
- `deriveLevel(totalXP): number`（委托现有 `calculateLevel`）
- `deriveCurrentStreak(checkInDates, freezeDates, today): number` —— 从今天（或昨天）往回走；遇到冻结保护日跳过；遇未保护缺口断开
- `deriveLongestStreak(checkInDates, freezeDates): number` —— 全历史保护感知扫描
- `deriveMilestoneAwards(checkInDates, freezeDates): number` —— 每段保护感知 run 的 `Σ floor(runLen/7)`（7 天里程碑奖励）
- `deriveLevelUpAwards(level): number` —— `max(0, level − 1)`（每个等级阈值只奖励一次，幂等）
- `deriveFreezesAvailable(level, milestoneAwardsPerHabit, consumedCount): number` —— `2 + (level−1) + Σ milestoneAwards − consumed`，显示时 clamp [0, 5]
- `evaluatePastDay(habits, checkIns, date): DailyOutcome` —— 从 `nightly-job.ts` 下沉的逐日评估纯函数

### 删除
- `streak-engine.ts` 中的 LEGACY `evaluateStreakState` 及全部过时注释
- 不再使用/写入 `streaks` 表作为逻辑载体（表保留为派生缓存）

## 设计段 2：存储层（storage）

### 数据库 schema v3
- 新增表 `freezeEvents`：`id, type('consumed'|'earned_level_up'|'earned_milestone'), date, habit_id?, note?`
- 说明：奖励事件已改为派生化（段 1），因此 `freezeEvents` 实际只记录 consumed；earned 类型字段保留以便未来扩展，但本轮不写入。
- `version(3).upgrade()` 仅新增表，无数据迁移。

### 新写入服务 `check-in-service.ts`（唯一写路径）
- `toggleCheckIn(habitId)`：事务内
  1. 读今日打卡：有 → 删除；无 → 插入（`awarded_xp = calculateXP(insert 前派生 streak)`、`streak_at_time`）
  2. 派生 `total_xp = Σ(awarded_xp)`、`current_level`
  3. 派生各 habit streak 缓存并写回 `streaks` 表（作为缓存物化视图，hooks 直接读）
  4. 写回 `userStats`（缓存）
  5. 返回 `{action, xp, leveled_up}`
  - `leveled_up = 新 level > 旧 level`（仅用于 UI toast，不做账本写入）
- `renameHabit(id, title)`：改标题，历史不变
- `archiveHabit(id)` / `unarchiveHabit(id)`：置/清 `archived_at`，历史与统计保留
- `deleteHabit(id)`：事务内删除习惯 + 其全部打卡 + streak 缓存行。派生 XP 自然回落（打卡记录移除，分数诚实反映事实——非惩罚性扣分）
- `exportBackup(): BackupPayload` —— 打包 `{version, exported_at, habits, checkIns, userStats, freezeEvents}`

### 夜间评估 `nightly-evaluator.ts`（替换 `nightly-job.ts`）
- 对 `last_evaluated_date` 之后的每个过去日（不含今天）：
  1. `evaluatePastDay` 纯函数判定 outcome
  2. `missed_all_scheduled` 且 `freezes_available > 0` → 追加 `freezeEvents(consumed)`
  3. 断签日不记录（派生缺口自然体现）
  4. 重算 streaks 缓存
- `last_evaluated_date` 前移至今天
- 幂等：重复调用不重复消费（按 last_evaluated_date 推进）

### hooks 拆分
- 查询逻辑（weekly summary、备份组装）提为 storage 层纯函数（可单测）
- `useWeeklySummary` 变薄，仅组合查询 + dismissed 状态
- 保留 `useHabits / useCheckIn / useUserStats / useStreak / useLogicalDate`（签名不变，UI 调用点不动）
- 删除 `toggleCheckIn` 旧实现（hooks.ts 中被 replace）

### 删除
- `nightly-job.ts` 旧实现
- hooks.ts 中的增量 XP/streak/freeze 逻辑

## 设计段 3：UI 缺口功能

### 习惯管理
- `DailyCheckInItem` 增加操作菜单（编辑 / 归档 / 删除）
  - 编辑：模态框内改名（复用 CreateHabitForm 样式）
  - 归档：确认后从每日列表移除
  - 删除：二次确认模态框 → `deleteHabit`
- 新增归档列表视图（App 页脚入口）：显示已归档习惯，可恢复（unarchive）/彻底删除
- `useHabits` 保持只返回未归档习惯

### 备份导出
- App 页脚「导出备份」按钮 → `exportBackup()` → Blob 下载 `gamified-backup-YYYY-MM-DD.json`
- 本轮不做导入

### 数据流
- 所有写操作走 `check-in-service`；UI 组件不直接触碰 db

## 设计段 4：analytics 包

- `packages/analytics` 实现为真实 workspace 包（`"analytics": "file:../analytics"` 被 ui 依赖）
- 从 `ui/src/lib/analytics.ts` 提升，事件 schema 类型化：
  - 现有：`app_opened`、`check_in_completed`、`habit_created`
  - 新增：`habit_renamed`、`habit_archived`、`habit_unarchived`、`habit_deleted`、`backup_exported`
- 双模式：dev → console；prod → PostHog（`VITE_POSTHOG_KEY` 存在才 init，否则 no-op + console.warn）
- Sentry 错误监控：`VITE_SENTRY_DSN` env-gated（无 DSN 则 no-op）
- 删除 `ui/src/lib/analytics.ts`，UI 改从 `'analytics'` 导入
- 保留现有依赖（@sentry/react、posthog-js），无新增依赖

## 设计段 5：E2E（Playwright）

- 在 `tests/e2e` 建独立 package（`@playwright/test`），`playwright.config.ts` 指向 `packages/ui` 的 vite dev/preview server
- 用例覆盖核心旅程：
  1. 创建习惯 → 出现在列表
  2. 打卡 → XP toast 出现 → 再次点击取消
  3. 编辑改名 → 列表更新
  4. 归档 → 从列表消失 → 归档页可见 → 恢复
  5. 删除（确认）→ 从列表消失
  6. 备份导出 → download 事件触发、JSON 包含习惯数据
  7. 周报：`page.clock` 固定到周一 → modal 出现 → dismiss
- CI（`.github/workflows/ci.yml` 扩展）：`vite build` + `vite preview` + `playwright install chromium`，跑 E2E

## 数据兼容与迁移

- 现有 IndexedDB 数据（v1/v2 用户）：schema v3 仅新增 `freezeEvents` 表，`upgrade()` 自动建表，零数据迁移
- 首次升级后运行一次 nightly evaluator 即完成派生缓存回填
- `streaks` 表既有数据在首次派生后自然覆盖为缓存值

## 测试策略

| 层 | 内容 |
|---|---|
| domain | derive-engine 全函数参数化测试（含 DST、冻结边界、run 分段） |
| storage | check-in-service 集成测试（toggle/编辑/归档/删除/导出）、nightly 幂等测试、周报查询纯函数测试 |
| ui | 组件测试更新（菜单、模态框、归档列表、删除确认） |
| e2e | 上述 7 条 Playwright 用例 |

- 验收门槛：`npm test` 全绿、`npm run build` 通过、E2E 全绿

## 实施阶段（写入实现计划）

1. **P0 领域层**：derive-engine.ts + 测试；删除 LEGACY
2. **P0 存储层**：schema v3、check-in-service、nightly-evaluator、hooks 拆分；迁移/更新现有测试
3. **P0 UI 缺口**：习惯菜单/编辑/归档/删除、归档列表、备份导出；组件测试
4. **P1 analytics 包**：包实现、事件接入、移除 lib/analytics.ts
5. **P1 E2E**：Playwright 设置 + 7 用例 + CI 接入
6. **收尾**：文档更新（architecture/specs/README）、清理空目录、全量验证

## 非目标（本轮不做）

- UI 视觉打磨 / 响应式重设计
- 备份导入
- 多设备同步、云后端
- 新游戏化系统（称号、商店等）