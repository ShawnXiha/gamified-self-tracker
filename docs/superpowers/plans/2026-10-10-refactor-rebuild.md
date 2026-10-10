# Gamified Self-Tracker 重构重做实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以「checkIns 为唯一事实源」的派生架构重构核心状态逻辑（消除双路径冻结消费与 LEGACY 代码），补齐习惯编辑/归档/删除、备份导出、analytics 包、E2E 四项缺口；产品行为不回归。

**Architecture:** 三层不变（domain → storage → ui）。domain 新增纯函数派生引擎（XP/连续/里程碑/冻结全部由打卡记录派生，冻结消费事件追加账本）；storage 收敛为「唯一写入服务 + 夜间评估器 + 派生缓存」；ui 增加习惯管理与备份入口；analytics 从 ui 提升为独立包；tests/e2e 用 Playwright 铺真实浏览器测试。

**Tech Stack:** TypeScript、Vitest、Dexie/fake-indexeddb、React 18 + Vite 8 + Tailwind 4、Playwright、PostHog/Sentry（env-gated）。

**Spec:** `docs/superpowers/specs/2026-10-10-refactor-rebuild-design.md`

## Global Constraints

- domain 包内纯函数零框架依赖；业务日期一律经 `date-engine`（04:00 逻辑日），禁止裸 `new Date()` 做业务判断。
- `toggleCheckIn` 是唯一打卡写路径；UI 组件不得直接触碰 `db`。
- 派生语义：`total_xp = Σ(awarded_xp)`；`freezes_available = 2 + (level−1) + Σ里程碑奖励 − consumed事件数`，显示时 clamp `[0,5]`。
- `freezeEvents` 只追加、永不修改/删除；consumed 事件仅在夜间评估过去日时写入。
- 彻底删除习惯 = 删除习惯 + 其全部打卡 + streak 缓存行；XP 派生后诚实回落（非惩罚性扣分）。
- storage 测试沿用现有模式：`await db.delete(); await db.open();` + `vi.useFakeTimers({toFake:['Date']})`（见 `toggleCheckIn.xp.test.ts`）。
- dexie 表名/字段命名 snake_case 保持现状；`streaks` 表降级为派生缓存，schema 字段不变。
- CI 使用 node 18；提交粒度：每个任务一个 commit，`feat:`/`refactor:`/`test:`/`docs:` 前缀。
- 验收门槛：根目录 `npm test` 全绿、`npm run build` 通过、`tests/e2e` 全绿。

## Review Focus

1. **04:00 边界**：03:59 的打卡必须计入「昨天」（`getLogicalDate`），派生连续/周报随之归位。—— Task 3 测试用 `setSystemTime` 钉死 03:59。
2. **冻结只消费一次**：`runNightlyEvaluation` 重复调用、同一天不重复消费；无冻结可用时全断。—— Task 6 幂等测试。
3. **删除无孤儿数据**：删习惯后 weekly summary、streaks 缓存、派生 XP 保持一致，无悬空打卡。—— Task 4、Task 7。
4. **归档语义**：归档习惯不进每日列表、不参与夜间 scheduled，但其历史打卡保留在 lifetime days 统计。—— Task 6、Task 7。
5. **同日反复 toggle（开→关→开）**：派生值稳定、升级提示不重复、冻结奖励不因开关而增减。—— Task 3。
6. **全新用户首启**：无任何数据时第一次 `runNightlyEvaluation` 与第一次 toggle 不报错、初始冻结 = 2。—— Task 3、Task 6。

---

### Task 1: domain 派生引擎 derive-engine

**Files:**
- Create: `packages/domain/src/derive-engine.ts`
- Test: `packages/domain/src/__tests__/derive-engine.test.ts`

**Interfaces:**
- Consumes: `parseYYYYMMDDToUTCms`, `calculateDayGap`（`./date-engine`）
- Produces:
  - `deriveTotalXP(checkIns: ReadonlyArray<{ awarded_xp: number }>): number`
  - `interface StreakStats { current: number; longest: number; milestoneAwards: number }`
  - `deriveStreakStats(checkInDates: ReadonlySet<string>, freezeDates: ReadonlySet<string>, startDate: string, today: string): StreakStats` — current=从今天往回走：今天未打卡跳过（进行中日），冻结日跳过不计数不中断，首个未保护缺口即断；longest/milestoneAwards=从 startDate 到 today 前向扫描，`d∈dates → run+=1`（run 命中 7 的倍数时 milestoneAwards+=1），`d∈freezeDates → run 不变`，`d∉dates∪freezeDates → run=0`
  - `deriveLevelUpAwards(level: number): number` — `max(0, level − 1)`
  - `deriveFreezesAvailable(level: number, milestoneAwards: number, consumedCount: number): number` — `2 + (level−1) + milestoneAwards − consumedCount`，clamp `[0,5]`

- [ ] **Step 1: 写失败测试** `derive-engine.test.ts`，用例（所有日期用 `2026-04-xx` 序列，today=`2026-04-17`，startDate=`2026-04-01`）：
  - 空集合 → `{current:0, longest:0, milestoneAwards:0}`
  - `{16日}`、today 未打卡 → current=1（today 进行中不中断）
  - `{16,15}` → current=2
  - `{16,14}`（15 未保护缺口）→ current=1（打断重启）
  - `{15,14}`、freeze={16}、today=17 → current=2（冻结日跳过）
  - 两段 run：`{12,11,10}` 与 `{16}` → longest=3, current=1
  - run 长 8（`{10..17}` 连续 8 天）→ milestoneAwards=1；run 长 15 → 2；两段各 7 → 2
  - startDate 截断：startDate=`2026-04-10` 时 `{09,08}` 不计
  - `deriveTotalXP([{awarded_xp:10},{awarded_xp:16}]) === 26`；空数组 `=== 0`
  - `deriveLevelUpAwards(1)===0`、`(3)===2`
  - `deriveFreezesAvailable(1,0,0)===2`、`(5,0,0)===5`（clamp 上限）、`(1,0,3)===0`（clamp 下限）、`(6,3,0)===5`（超上限回落）

- [ ] **Step 2: 运行确认失败**
  Run: `npm run test --workspace=domain`
  Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `derive-engine.ts`**（上述签名；日期推进用 `parseYYYYMMDDToUTCms` + 24h 毫秒算术，复用 `getPast7LogicalDays` 的写法）

- [ ] **Step 4: 运行确认通过**
  Run: `npm run test --workspace=domain`
  Expected: 全部 PASS

- [ ] **Step 5: 提交**
  `git add packages/domain/src/derive-engine.ts packages/domain/src/__tests__/derive-engine.test.ts && git commit -m "feat(domain): add derive engine for XP, streaks, milestones, freezes"`

---

### Task 2: 删除 domain LEGACY 并收尾 streak-engine

**Files:**
- Modify: `packages/domain/src/streak-engine.ts`（删除 `applyDailyOutcome`、`evaluateStreakState` 及 LEGACY 注释）
- Modify: `packages/domain/src/__tests__/streak-engine.test.ts`（删除对应 describe 块）

**Interfaces:**
- Consumes: Task 1 已确认 `derive-engine` 覆盖全部派生需求
- Produces: `streak-engine.ts` 仅保留 `LogicalDate/HabitId/HabitDayInput/LogicalDayInput/DailyOutcome` 类型 + `evaluateLogicalDay`（夜间评估仍使用）

- [ ] **Step 1: 删除 LEGACY（改代码，同时删测试引用）**——`grep` 确认 `evaluateStreakState|applyDailyOutcome` 仅剩 streak-engine 自身与测试文件后移除

- [ ] **Step 2: 运行**
  Run: `npm run test --workspace=domain`
  Expected: 全部 PASS

- [ ] **Step 3: 提交**
  `git commit -am "refactor(domain): remove legacy streak evaluation paths"`

---

### Task 3: storage schema v3 + freezeEvents 表

**Files:**
- Modify: `packages/storage/src/db.ts`
- Test: `packages/storage/src/__tests__/db.test.ts`

**Interfaces:**
- Produces:
  - `interface FreezeEvent { id: string; type: 'consumed'; logical_date: string; created_at: number }`
  - `GamifiedTrackerDB.freezeEvents!: Table<FreezeEvent, string>`
  - `version(3).stores({ habits: 'id, title, created_at, archived_at', checkIns: 'id, &[habit_id+logical_date], habit_id, logical_date, completed_at', streaks: 'habit_id, current_streak, longest_streak, last_check_in_date', userStats: 'id, total_xp, current_level, freezes_available', freezeEvents: 'id, type, logical_date' })`（v3 stores 必须列全所有表，否则 dexie 会删表）

- [ ] **Step 1: 写失败测试**（db.test.ts 追加）：`freezeEvents` 表存在、可 add/get consumed 事件、type 索引可用

- [ ] **Step 2: 运行确认失败**
  Run: `npm run test --workspace=storage`
  Expected: FAIL（表不存在）

- [ ] **Step 3: 实现 db.ts v3**

- [ ] **Step 4: 运行确认通过**（既有 storage 测试应全部保持 PASS，若因 v1/v2 升级链失败则修 upgrade）

- [ ] **Step 5: 提交**
  `git commit -am "feat(storage): add freezeEvents table at schema v3"`

---

### Task 4: storage 唯一写路径 check-in-service — toggleCheckIn 派生化

**Files:**
- Create: `packages/storage/src/check-in-service.ts`
- Modify: `packages/storage/src/index.ts`（`export * from './check-in-service'`）
- Rewrite: `packages/storage/src/__tests__/toggleCheckIn.xp.test.ts`、`packages/storage/src/__tests__/toggleCheckIn.race.test.ts`
- Delete: `packages/storage/src/hooks.ts` 中的旧 `toggleCheckIn` 实现（hooks.ts 改为从 check-in-service re-export，见 Task 6 一并清理）

**Interfaces:**
- Consumes: Task 1 `derive-engine`、Task 3 `freezeEvents`；`useLogicalDate` 语义
- Produces:
  - `async function toggleCheckIn(habitId: string): Promise<{ action: 'added' | 'removed'; xp: number; leveled_up: boolean }>`
  - 内部 helper（同文件，供 Task 5 复用）：`async function recomputeCachesForHabit(habitId: string): Promise<void>` —— 读取该 habit 全部打卡日期与 consumed 冻结日期，`deriveStreakStats` 后写回 `streaks` 缓存行；`recomputeUserStatsCache(): Promise<void>` —— `deriveTotalXP` 全量求和、`calculateLevel`、`deriveFreezesAvailable`（含 `deriveLevelUpAwards` + 各 habit `deriveMilestoneAwards` 之和），写回 `userStats`

**行为：**
- added：事务内插入 `{awarded_xp: calculateXP(派生 current), streak_at_time: 派生 current}` → 写缓存；`leveled_up = 缓存 level 较事务前上升`
- removed：删除今日打卡行 → 写缓存（XP=Σ 自然回落）
- 冻结奖励**不**在 toggle 时写账本（派生化，Review Focus 5）

- [ ] **Step 1: 重写失败测试** `toggleCheckIn.xp.test.ts`（改为以打卡记录为种子，不再手工种 `userStats.total_xp=100`）：
  - 种子：habit 有 `{2026-04-15, awarded_xp:10}`、`{2026-04-16, awarded_xp:10}`（派生 streak=2），today=`2026-04-17T10:00` Z；toggle → added：`awarded_xp=12`（`calculateXP(2)`）、`streak_at_time=2`、`userStats.total_xp=32`、streak 缓存 `current=3,last_check_in_date='2026-04-17'`
  - 「04:00 边界」：today=`2026-04-18T03:30` 本地时间 → 新增打卡 `logical_date='2026-04-17'`
  - removed：toggle OFF → total_xp=20（Σ 回落）、streak 缓存 current 回到 2、`last_check_in_date` 回到真实前一打卡 `'2026-04-16'`（派生天然正确，旧的手工回退逻辑删除）
  - 同日开→关→开（Review Focus 5）：最终 total_xp、level、freezes_available 与单次开一致；`leveled_up` 仅在跨等级那次为 true（用 XP 卡在阈值附近验证）

- [ ] **Step 2: 运行确认失败**
  Run: `npm run test --workspace=storage`
  Expected: FAIL（旧实现行为不符）

- [ ] **Step 3: 实现 `check-in-service.ts`**；hooks.ts 中删除旧 `toggleCheckIn` 并改为 `export { toggleCheckIn } from './check-in-service'`
- [ ] **Step 4: `toggleCheckIn.race.test.ts` 同步修订**（并发 toggle 事务性保持，开→关竞态最终派生一致），运行确认 PASS
- [ ] **Step 5: 提交**
  `git commit -am "refactor(storage): derive XP and streak state in check-in service"`

---

### Task 5: 习惯管理 + 备份导出服务

**Files:**
- Modify: `packages/storage/src/check-in-service.ts`
- Create: `packages/storage/src/backup.ts`
- Create: `packages/storage/src/__tests__/habit-management.test.ts`
- Create: `packages/storage/src/__tests__/backup.test.ts`
- Modify: `packages/storage/src/index.ts`

**Interfaces:**
- Consumes: Task 4 的 `recomputeUserStatsCache`
- Produces:
  - `async function renameHabit(habitId: string, title: string): Promise<void>`（空标题报错 `throw new Error('Title cannot be empty')`）
  - `async function archiveHabit(habitId: string): Promise<void>`（置 `archived_at=Date.now()`；重复调用幂等）
  - `async function unarchiveHabit(habitId: string): Promise<void>`（清 `archived_at`）
  - `async function deleteHabit(habitId: string): Promise<void>`（事务：删 habit 行 + 其 checkIns + 其 streaks 行，随后 `recomputeUserStatsCache`）
  - `interface BackupPayload { version: 1; exported_at: string; habits: Habit[]; checkIns: DailyCheckIn[]; userStats: UserStats | undefined; freezeEvents: FreezeEvent[] }`
  - `function buildBackupPayload(habits, checkIns, userStats, freezeEvents): BackupPayload`（纯函数）
  - `async function exportBackup(): Promise<BackupPayload>`

- [ ] **Step 1: 写失败测试** `habit-management.test.ts`：rename 后标题变、打卡历史保留；archive 后 `useHabits` 语义（habit 不在未归档集合——在 storage 层验证 `archived_at` 非空即可，UI 过滤在 Task 8）；unarchive 恢复；delete 后 habit/checkIns/streak 三处全无、`userStats.total_xp` 回落为其余打卡之和、freezeEvents 不受影响
- [ ] **Step 2: 运行确认失败** → **Step 3: 实现**（deleteHabit 后派生缓存正确性即 Review Focus 3）
- [ ] **Step 4: 备份测试**：`buildBackupPayload` 快照形状（version=1、exported_at ISO、含四类数据）；`exportBackup` 真实读库组装成功
- [ ] **Step 5: 运行全部 storage 测试 PASS**
- [ ] **Step 6: 提交**
  `git commit -am "feat(storage): habit management ops and JSON backup export"`

---

### Task 6: 夜间评估器 nightly-evaluator（含 hooks 清理）

**Files:**
- Create: `packages/storage/src/nightly-evaluator.ts`
- Delete: `packages/storage/src/nightly-job.ts`
- Rewrite: `packages/storage/src/__tests__/nightly-job.test.ts` → `nightly-evaluator.test.ts`
- Modify: `packages/storage/src/hooks.ts`（删除旧 toggle/增量逻辑遗留、`useWeeklySummary` 之外的杂项清理：`useArchivedHabits` 新增）
- Modify: `packages/storage/src/index.ts`

**Interfaces:**
- Consumes: Task 1 `evaluateLogicalDay`、Task 3 `freezeEvents`、Task 4 缓存写回
- Produces:
  - `async function runNightlyEvaluation(): Promise<void>` —— 语义与旧版一致但仅做两件事：对 `(last_evaluated_date, today)` 之间每个过去日跑 `evaluateLogicalDay`（active habits 仅含未归档），`missed_all_scheduled` 且派生 `freezes_available>0` → 追加 `freezeEvents` consumed 行；随后全量重写 streaks 缓存 + `recomputeUserStatsCache`；`last_evaluated_date=today`。幂等：gap≤0 直接 return
  - `hook: useArchivedHabits(): Habit[]`（`db.habits.filter(h => h.archived_at !== null)`）

- [ ] **Step 1: 写失败测试** `nightly-evaluator.test.ts`：
  - 昨天全天全miss + 有冻结 → 追加 1 条 consumed、freezes 派生减 1、streak 缓存保留
  - 连续两天全miss 且冻结不足 → 第二天起 streak 缓存清零（断层而非逐日消耗）
  - 部分完成日 → 未打卡 habit 的 streak 清零、打卡 habit 保留、**不**消耗冻结
  - 归档 habit 不计入 scheduled（归档后全miss 判定以未归档为准）
  - 幂等（Review Focus 2）：连续调用两次效果一致、consumed 不重复
  - 全新用户首启（Review Focus 6）：无 userStats 时初始化 `{total_xp:0, level:1, freezes_available:2}` 并置 last_evaluated_date，不抛错
- [ ] **Step 2: 运行确认失败** → **Step 3: 实现并删除 nightly-job.ts、更新 index.ts**
- [ ] **Step 4: hooks.ts 清理**：删除旧 `toggleCheckIn` 内联实现（Task 4 已 re-export），确认 `useStreak` 读缓存、导出 `useArchivedHabits`；运行 storage 全部测试 PASS
- [ ] **Step 5: 提交**
  `git commit -am "refactor(storage): nightly evaluator with idempotent freeze ledger"`

---

### Task 7: 周报纯函数抽取 + hooks 变薄

**Files:**
- Create: `packages/storage/src/weekly-summary.ts`
- Create: `packages/storage/src/__tests__/weekly-summary.test.ts`
- Modify: `packages/storage/src/hooks.ts`（`useWeeklySummary` 改写：仅 fetch 数据 + 调纯函数）
- Modify: `packages/storage/src/__tests__/hooks.weeklySummary.test.tsx`

**Interfaces:**
- Consumes: Task 4 缓存
- Produces:
  - `interface WeeklySummary { completedHabits: number; totalHabits: number; consistencyRate: number; longestStreak: number; freezesRemaining: number; totalLifetimeDays: number }`
  - `function buildWeeklySummary(activeHabits: Habit[], past7CheckIns: DailyCheckIn[], allCheckIns: DailyCheckIn[], longestStreak: number, freezesRemaining: number): WeeklySummary` —— `totalHabits = activeHabits.length * 7`、`completedHabits = past7CheckIns.length`、`consistencyRate = completedHabits / totalHabits`（totalHabits=0 → 0）、`totalLifetimeDays = new Set(allCheckIns.map(c => c.logical_date)).size`（含归档历史，Review Focus 4）
  - hook `useWeeklySummary` 签名与 dismissed 行为不变

- [ ] **Step 1: 写失败测试** `weekly-summary.test.ts`（纯函数输入输出断言；含 totalHabits=0 的除零、归档 habit 历史计入 lifetime days）
- [ ] **Step 2: 运行确认失败** → **Step 3: 实现 weekly-summary.ts 并改写 hook**（fetch 部分沿用旧 hook 的 dexie 查询：past7 用 `getPast7LogicalDays` 过滤、longestStreak 取 streaks 表 max）
- [ ] **Step 4: 更新 `hooks.weeklySummary.test.tsx` 以匹配新 hook 内部结构**，运行 storage 全部测试 PASS
- [ ] **Step 5: 提交**
  `git commit -am "refactor(storage): extract weekly summary aggregation to pure function"`

---

### Task 8: UI 习惯管理（菜单 / 编辑 / 归档 / 删除 / 归档列表）

**Files:**
- Create: `packages/ui/src/components/ConfirmDialog.tsx`（props：`{title, message, confirmLabel, onConfirm, onCancel}`）
- Create: `packages/ui/src/components/EditHabitModal.tsx`（props：`{habitId, initialTitle, onClose}`）
- Create: `packages/ui/src/components/ArchivedHabitsModal.tsx`（用 `useArchivedHabits`，每行「恢复」「删除」按钮）
- Create: `packages/ui/src/components/HabitActionsMenu.tsx`（⋯ 下拉：编辑/归档/删除，删除走 ConfirmDialog）
- Modify: `packages/ui/src/components/DailyCheckInItem.tsx`（接入菜单）、`packages/ui/src/components/HabitList.tsx`（不变）`packages/ui/src/App.tsx`（页脚：归档入口 + 导出备份按钮 + modal 状态）、`packages/ui/src/components/index.ts`
- Test: `packages/ui/src/components/__tests__/HabitManagement.test.tsx`（新建）、修改 `DailyCheckInItem.test.tsx` 适配

**Interfaces:**
- Consumes: Task 5 `renameHabit/archiveHabit/unarchiveHabit/deleteHabit`、Task 6 `useArchivedHabits`
- Produces: 上述组件导出；App store 页脚操作状态

- [ ] **Step 1: 写失败组件测试**（fake-indexeddb，沿用现有测试 setup）：
  - DailyCheckInItem 展开菜单 → 编辑 modal 改名 → 列表标题更新
  - 归档 → 不再出现在 `useHabits` 列表（App 层断言）→ 打开归档 modal 可见 → 恢复 → 回到列表
  - 删除 → ConfirmDialog 出现，确认后 habit 消失；取消则保留
- [ ] **Step 2: 运行确认失败**
  Run: `npm run test --workspace=ui`
  Expected: FAIL
- [ ] **Step 3: 实现组件 + App 集成**；`components/index.ts` 导出新组件
- [ ] **Step 4: 运行确认通过**（含既有 ui 测试回归）
- [ ] **Step 5: 提交**
  `git commit -am "feat(ui): habit edit, archive, delete and archived list"`

---

### Task 9: UI 备份导出按钮

**Files:**
- Modify: `packages/ui/src/App.tsx`（页脚「导出备份」按钮 + 下载逻辑）
- Test: `packages/ui/src/__tests__/App.test.tsx`（或新建 `BackupExport.test.tsx`）

**Interfaces:**
- Consumes: Task 5 `exportBackup`
- Produces: `function downloadBackup(payload: BackupPayload): void`（`URL.createObjectURL` + `<a download="gamified-backup-YYYY-MM-DD.json">` 点击触发 + revoke）

- [ ] **Step 1: 写失败测试**：mock `URL.createObjectURL`/`revokeObjectURL`，点击「导出备份」→ 断言 createObjectURL 收到含 `version:1` 与 habits 的 Blob JSON、a 元素 download 属性为 `gamified-backup-*.json`
- [ ] **Step 2: 运行确认失败** → **Step 3: 实现** → **Step 4: PASS**
- [ ] **Step 5: 提交**
  `git commit -am "feat(ui): export backup JSON download"`

---

### Task 10: analytics 独立包

**Files:**
- Create: `packages/analytics/package.json`（`name: "analytics"`，deps：`posthog-js`、`@sentry/react`；scripts：`test: vitest run`）
- Create: `packages/analytics/src/index.ts`
- Create: `packages/analytics/src/__tests__/analytics.test.ts`
- Modify: `packages/ui/package.json`（移除 `posthog-js`/`@sentry/react`，新增 `"analytics": "file:../analytics"`）
- Modify: `packages/ui/src/main.tsx`（`Sentry.init`/`posthog.init` → `await initAnalytics()`）
- Delete: `packages/ui/src/lib/analytics.ts`
- Modify: `packages/ui/src/App.tsx`、`packages/ui/src/components/CreateHabitForm.tsx`、`packages/ui/src/components/DailyCheckInItem.tsx`（改从 `'analytics'` 导入）

**Interfaces:**
- Produces:
  - `type AnalyticsEvent = { name: 'app_opened'|'check_in_completed'|'habit_created'|'habit_renamed'|'habit_archived'|'habit_unarchived'|'habit_deleted'|'backup_exported'; properties: Record<string, unknown> }`
  - `async function initAnalytics(): Promise<void>`：先 `import('posthog-js')` 懒加载，`import.meta.env.VITE_POSTHOG_KEY` 存在才 init（`VITE_POSTHOG_HOST` 覆盖 api_host）；`VITE_SENTRY_DSN` 存在才 `Sentry.init`；两者皆无 → 模块内 `initialized=false`、console.warn 一次
  - `function trackEvent(event: AnalyticsEvent): void`：dev → console.log（沿用旧行为）；`initialized` → `posthog.capture`；否则 no-op
  - `getDeviceType() / isPwaInstalled() / getTimeOfDay()` 原样迁移
- [ ] **Step 1: 写失败测试**：无 key 环境 `initAnalytics()` 后 `trackEvent` 不抛错且 no-op；dev 环境 console.log 调用（spy）；`getTimeOfDay` 边界（5/12/17/21 点）
- [ ] **Step 2: 运行确认失败**（analytics 包独立 vitest，jsdom env）
- [ ] **Step 3: 实现包 + ui 迁移**；`npm install` 更新锁文件后 `npm run build --workspace=ui` 通过
- [ ] **Step 4: ui 测试回归 PASS**
- [ ] **Step 5: 提交**
  `git commit -am "feat(analytics): extract analytics package with env-gated posthog/sentry"`

---

### Task 11: E2E 脚手架 + 核心旅程用例

**Files:**
- Create: `tests/e2e/package.json`（`name: "e2e-tests"`，devDeps：`@playwright/test`；scripts：`test: playwright test`）
- Create: `tests/e2e/playwright.config.ts`（testDir `./tests`、webServer：`npm run dev --workspace=ui -- --port 4173 --strictPort`、baseURL `http://localhost:4173`、use: chromium）
- Create: `tests/e2e/tests/core-loop.spec.ts`
- Modify: `package.json`（root `workspaces` 追加 `"tests/e2e"`；scripts 追加 `"test:e2e": "npm run test --workspace=e2e-tests"`）

**Interfaces:**
- Consumes: 部署产物为 ui 包（dev server 即可）
- Produces: `async function resetApp(page: Page): Promise<void>`（`tests/e2e/tests/helpers.ts`）：`page.goto('/')` → `page.evaluate(() => new Promise(res => { const req = indexedDB.deleteDatabase('GamifiedTrackerDB'); req.onsuccess = req.onerror = () => res(undefined); }))` → 再次 goto 干净启动
- [ ] **Step 1: 搭脚手架**（package.json/配置/helpers），`npm install`
- [ ] **Step 2: 写核心旅程用例** `core-loop.spec.ts`：create habit → 列表出现 → 勾选打卡 → `+XP` toast 可见 → 取消勾选 → toast 不再出现；每用例前 `resetApp`
- [ ] **Step 3: 本地运行**
  Run: `npm run test:e2e`
  Expected: 用例 PASS（首次需 `npx playwright install chromium`）
- [ ] **Step 4: 提交**
  `git commit -am "test(e2e): scaffold playwright and core loop spec"`

---

### Task 12: E2E 管理 / 备份 / 周报用例 + CI 接入

**Files:**
- Create: `tests/e2e/tests/manage.spec.ts`
- Create: `tests/e2e/tests/backup.spec.ts`
- Create: `tests/e2e/tests/weekly-summary.spec.ts`
- Modify: `.github/workflows/ci.yml`（追加 playwright job：`npm test > npm run build` 后 `npx playwright install --with-deps chromium` + `npm run test:e2e`）

- [ ] **Step 1: manage.spec.ts**：编辑改名 → 列表更新；归档 → 列表消失 → 归档 modal 恢复；删除（确认）→ 消失
- [ ] **Step 2: backup.spec.ts**：点「导出备份」→ `page.waitForEvent('download')` → `download.path()` 读文件 → JSON parse → `version===1`、含刚创建的 habit
- [ ] **Step 3: weekly-summary.spec.ts**（Review Focus 1 联动）：`await page.clock.install(); await page.clock.setFixedTime(new Date('2026-10-12T10:00:00'))`（2026-10-12 为周一）→ 打卡 2 条 → 周报 modal 出现且 `Consistency Rate` 文本存在 → Close 后不再出现
- [ ] **Step 4: 本地全量**
  Run: `npm run test:e2e`
  Expected: 全部 PASS；同时根目录 `npm test`、`npm run build` PASS
- [ ] **Step 5: 提交**
  `git commit -am "test(e2e): manage, backup, weekly summary specs and CI job"`

---

### Task 13: 文档更新 + 清理 + 全量验证

**Files:**
- Modify: `docs/architecture.md`（状态模型改为派生架构：checkIns 事实源、freezeEvents 账本、check-in-service/nightly-evaluator 职责、streaks 表为缓存）
- Modify: `docs/developer-guide.md`（若含 db 结构/流程描述则同步）；`README.md`（功能清单补 4 项缺口、scripts 补 `test:e2e`、架构图补 analytics 包）
- Modify: `docs/superpowers/specs/2026-10-10-refactor-rebuild-design.md`（状态改为「已实现」，如实现中发现偏差则记录）
- Delete: 空目录 `tests/integration/`、`tests/unit/`（确认空后删除）

- [ ] **Step 1: 更新三份文档**
- [ ] **Step 2: 删除空目录**（git 不跟踪空目录，`rmdir` 即可）
- [ ] **Step 3: 全量验证**
  Run: `npm test`、`npm run build`、`npm run test:e2e`
  Expected: 全部通过
- [ ] **Step 4: 提交**
  `git commit -am "docs: update architecture and README for derived state model"`

---

## Self-Review 记录

- **Spec 覆盖**：段 1（derive-engine/删 LEGACY）→ T1/T2；段 2（v3/服务/夜间评估/hooks/周报）→ T3/T4/T5/T6/T7；段 3（UI 管理/备份）→ T8/T9；段 4（analytics 包）→ T10；段 5（E2E+CI）→ T11/T12；收尾 → T13。无遗漏。
- **类型一致性**：`toggleCheckIn` 返回类型与现有调用点（DailyCheckInItem）兼容；`runNightlyEvaluation` 名字保留（App.tsx 调用不变）；`useHabits/useStreak/useUserStats/useWeeklySummary` 签名不变；`BackupPayload.version` 字面量 `1` 全计划一致。
- **Review Focus 挂接**：1→T4 边界测试、2→T6 幂等、3→T5+T7、4→T6+T7、5→T4、6→T6 首启；均落在各自任务的测试步骤中。
- **比例**：spec 156 行 vs 计划 ≈400 行（含测试断言），各步骤为「一个签名 + 一组断言」，未转录函数体。