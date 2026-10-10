# Developer Guide — Gamified Self-Tracker

## Architecture Overview

Four-package monorepo with strict layering, plus an E2E test workspace:

```
packages/
├── domain/      Pure TypeScript — zero framework dependencies
├── storage/     IndexedDB via Dexie — React hooks for live queries + write services
├── analytics/   Typed event tracking + error reporting — env-gated PostHog/Sentry
└── ui/          React 18 SPA — Vite 8, Tailwind CSS 4, PWA
tests/
└── e2e/         Playwright end-to-end tests (self-starting vite on :4173)
```

**Dependency rule:** `domain ← storage ← ui` (+ `analytics ← ui`). Domain has no React or async deps. Storage depends on domain. UI depends on storage, domain, and analytics. Analytics depends on neither. The E2E workspace depends on nothing at build time — it talks to the running UI dev server.

## Getting Started

```bash
git clone <repo-url>
cd gamified-self-tracker
npm install
cd packages/ui && npm run dev
```

### Requirements

- Node.js 20.19+ or 22.12+ (Vite 8 engine range) — Node 18 no longer satisfies Vite 8's `engines`
- npm 9+

## Package Details

### domain (`packages/domain/`)

Pure business logic. No side effects, no async, no React. `checkIns` is the single source of truth; every engine here derives from it.

| File | Purpose |
|------|---------|
| `date-engine.ts` | Logical date (04:00 AM boundary), day gap calculation, 7-day window, Monday detection |
| `scoring-engine.ts` | `calculateXP(streak)`, `calculateLevel(totalXP)`, `calculateProgressToNextLevel(totalXP)` |
| `streak-engine.ts` | `evaluateLogicalDay()` + types — classifies a single day as kept / missed-all / no-schedule |
| `derive-engine.ts` | `deriveTotalXP`, `deriveStreakStats`, `deriveLevelUpAwards`, `deriveFreezesAvailable` — derives every streak/XP/freeze number from the source of truth |

Tests: `npm test` in packages/domain (Vitest, 49 tests)

### storage (`packages/storage/`)

IndexedDB persistence via Dexie 4. Provides React hooks using `dexie-react-hooks` and the single write path for every mutation.

| File | Purpose |
|------|---------|
| `db.ts` | Dexie schema — 5 tables (habits, checkIns, streaks, userStats, freezeEvents), indexes, unique constraints. `streaks` is a derived cache, `freezeEvents` an append-only consumed-freeze ledger |
| `hooks.ts` | `useLogicalDate`, `useHabits`, `useArchivedHabits`, `useCheckIn`, `useStreak`, `useUserStats`, `useWeeklySummary`, `addHabit` |
| `check-in-service.ts` | The only write path: `toggleCheckIn` (transactional insert/delete + cache recompute), `renameHabit`, `archiveHabit`, `unarchiveHabit`, `deleteHabit`, plus recompute helpers `recomputeCachesForHabit` / `recomputeUserStatsCache` |
| `nightly-evaluator.ts` | `runNightlyEvaluation()` — evaluates each unevaluated past day; its only persistent decision is appending consumed freezes to the ledger; then rebuilds caches and advances the checkpoint |
| `weekly-summary.ts` | `buildWeeklySummary()` — pure aggregation for the Monday modal (unit-testable, no db access) |
| `backup.ts` | `buildBackupPayload()` (pure) and `exportBackup()` (atomic read-only snapshot of all tables) |

Tests: `npm test` in packages/storage (Vitest + fake-indexeddb, 63 tests)

### analytics (`packages/analytics/`)

Typed observability, consumed by the UI only. No other package depends on it.

| File | Purpose |
|------|---------|
| `config.ts` | Reads the `VITE_*` environment variables and detects dev mode |
| `index.ts` | `initAnalytics()` (lazy, idempotent, env-gated PostHog/Sentry init), `trackEvent()` (typed event names, console in dev, PostHog in prod), `reportError()` (Sentry), device/PWA/time-of-day helpers |

Tests: `npm test` in packages/analytics (Vitest + jsdom, 19 tests)

### ui (`packages/ui/`)

React 18 SPA with Tailwind CSS 4 and PWA support.

| Component | Purpose |
|-----------|---------|
| `App.tsx` | Boot sequence: nightly evaluation → analytics init → habit list + header; footer with archived-habits modal + JSON backup export |
| `GamificationHeader.tsx` | Displays current level + XP progress bar |
| `HabitList.tsx` | Renders habits with empty state |
| `DailyCheckInItem.tsx` | Checkbox toggle + streak flame + XP toast + edit/archive/delete actions menu |
| `CreateHabitForm.tsx` | Input + Add button |
| `HabitActionsMenu.tsx` | Per-habit menu: edit, archive, delete |
| `EditHabitModal.tsx` | Rename modal reused by the actions menu |
| `ConfirmDialog.tsx` | Reusable confirmation modal (delete, etc.) |
| `ArchivedHabitsModal.tsx` | Archived habit list — restore or permanently delete |
| `LevelProgressBar.tsx` | CSS-animated progress bar |
| `StreakFlame.tsx` | Fire emoji + streak count |
| `XPToast.tsx` | Floating +XP/-XP animation (Level Up variant) |
| `WeeklySummaryModal.tsx` | Monday summary modal with stats |
| `ErrorBoundary.tsx` | Crash recovery with reload button |

Tests: `npm test` in packages/ui (Vitest + jsdom, 31 tests)

## Data Flow

### Check-In Flow

```
User taps checkbox
  → DailyCheckInItem → toggleCheckIn(habitId)          (check-in-service.ts)
    → getLogicalDate() from domain
    → one Dexie transaction over all 5 tables:
      1. Read the existing row for [habit_id + today]
      2. ADDING: insert the check-in row —
           awarded_xp = calculateXP(derived current streak BEFORE the insert)
           streak_at_time = that derived current
         REMOVING: delete today's row
      3. Recompute the derived caches inside the same transaction:
           recomputeCachesForHabit()  → streaks row (current/longest/last date)
           recomputeUserStatsCache()  → total_xp = Σ awarded_xp, current_level,
                                        freezes_available (derive engine)
      4. Return { action, xp, leveled_up }
    → XPToast displays +XP or "Level Up!"
    → GamificationHeader re-renders via useUserStats()
```

Freeze awards are never written by this flow — the ledger (`freezeEvents`) is appended to only by the nightly evaluator; consumed freeze dates merely protect days in the streak derivation.

### Nightly Evaluation Flow

```
App mounts → useEffect → runNightlyEvaluation()         (nightly-evaluator.ts)
  → checkpoint = userStats.last_evaluated_date
  → gap = calculateDayGap(checkpoint, today); if gap <= 0: no-op (idempotent)
  → For each past day after the checkpoint (up to but excluding today):
    - Build LogicalDayInput: active habits (created on/before that day,
      not archived) + that day's check-ins
    - evaluateLogicalDay() from domain
    - If missed_all_scheduled AND derived freezes_available > 0:
        append one freezeEvents row (type 'consumed', logical_date = that day)
        re-derive userStats — appending can itself RAISE availability (a
        protected day bridges a missed day, and a bridge crossing a 7-day
        boundary awards a milestone), so availability is re-read per decision
    - Otherwise nothing is written: a break needs no record, the derived
      streak scan sees the unprotected gap
  → Rebuild every habit's streak cache + the userStats cache from the
    source of truth (checkIns + freezeEvents + habit creation dates)
  → Advance the checkpoint: last_evaluated_date = today
  → Idempotent: a second run on the same day returns before touching
    anything — a freeze is consumed exactly once
```

## Database Schema (IndexedDB via Dexie)

### habits
| Field | Type | Index |
|-------|------|-------|
| id | string (PK) | — |
| title | string | indexed |
| created_at | number | indexed |
| archived_at | number \| null | indexed |

### checkIns
| Field | Type | Index |
|-------|------|-------|
| id | string (PK) | — |
| habit_id | string | indexed |
| logical_date | string | compound unique [habit_id+logical_date] |
| completed_at | number | indexed |
| awarded_xp | number | — |
| streak_at_time | number | — |

### streaks

Derived **materialized cache** — rebuildable at any time from `checkIns` + `freezeEvents` + habit creation dates. Hooks read it for reactivity only; every write goes through the derive engine.

| Field | Type | Index |
|-------|------|-------|
| habit_id | string (PK) | — |
| current_streak | number | indexed |
| longest_streak | number | indexed |
| last_check_in_date | string \| null | indexed |

### userStats
| Field | Type | Index |
|-------|------|-------|
| id | string (PK) | — |
| total_xp | number | indexed |
| current_level | number | indexed |
| freezes_available | number | indexed |
| last_evaluated_date | string? | — |

### freezeEvents

Append-only ledger of consumed freezes. Only the nightly evaluator appends; nothing ever edits or deletes rows.

| Field | Type | Index |
|-------|------|-------|
| id | string (PK) | — |
| type | 'consumed' | indexed |
| logical_date | string | indexed |
| created_at | number | — |

## Testing

```bash
# All unit/integration tests
npm test                        # 162 tests total

# Per package
cd packages/domain && npm test    # 49 tests — pure logic, milliseconds
cd packages/storage && npm test   # 63 tests — IndexedDB via fake-indexeddb
cd packages/ui && npm test        # 31 tests — component tests via jsdom
cd packages/analytics && npm test # 19 tests — env-gated init + typed events
```

### E2E (Playwright)

```bash
npx playwright install chromium   # first run only (downloads the browser)
npm run test:e2e                  # 8 tests — boots the UI itself
```

The suite lives in `tests/e2e/` (workspace `e2e-tests`). `playwright.config.ts` self-starts the UI's Vite dev server on `localhost:4173` (`--strictPort`, so it never collides with your own `:5173` dev server). All 8 tests run in a real Chromium browser and cover the core journey: create habit → check-in (+XP toast) → rename → archive/restore → delete-with-confirmation → backup export → weekly summary on a pinned Monday. Traces are kept on first retry under `tests/e2e/test-results/`. CI runs the same suite (see `.github/workflows/ci.yml`).

### Test Strategy

- **Domain**: Input/output contracts. Every engine function has tests for normal, edge, and error cases.
- **Storage**: Schema creation, CRUD operations, transaction atomicity, hook reactivity. Uses `fake-indexeddb/auto` for in-memory DB.
- **UI**: Component rendering, user interactions, mock storage hooks. Uses `jsdom` environment with `@testing-library/react`.
- **E2E**: Full user journeys in a real browser against the dev server — no test doubles.

## Building & Deployment

```bash
# Production build
cd packages/ui && npm run build
# Output: packages/ui/dist/

# Deploy to Vercel
cd packages/ui && vercel deploy
```

The Vite build produces:
- `dist/index.html` — entry point
- `dist/assets/index-*.js` — main bundle (~266 KB; gzip ~86 KB)
- `dist/assets/index-*.css` — Tailwind CSS (~16.5 KB)
- `dist/sw.js` + `dist/workbox-*.js` — Workbox service worker (12 precached entries, ~549 KB total)
- `dist/manifest.webmanifest` — PWA manifest

The analytics SDKs are split into lazy chunks (`module-*.js` = PostHog ~186 KB, `esm-*.js` = Sentry ~83 KB) and only load when the matching `VITE_*` env var is present at build time.

## Adding a Feature

1. **Domain first**: Add pure functions with tests in `packages/domain/src/`
2. **Persistence**: Add DB schema changes + hooks in `packages/storage/src/`
3. **UI last**: Add components consuming the hooks in `packages/ui/src/components/`

Example: adding a "habit streak bonus" feature:
1. `domain/src/scoring-engine.ts` — add `calculateStreakBonus(streak): number`
2. `domain/src/__tests__/scoring-engine.test.ts` — add test cases
3. `storage/src/check-in-service.ts` — call bonus in `toggleCheckIn`
4. `ui/src/components/XPToast.tsx` — display bonus in toast

## Environment Variables

Read by the `analytics` package (`initAnalytics` / `trackEvent`) — they are not used anywhere else.

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SENTRY_DSN` | No | Sentry error reporting (no-op if unset) |
| `VITE_POSTHOG_KEY` | No | PostHog analytics (no-op if unset) |
| `VITE_POSTHOG_HOST` | No | PostHog `api_host` override (defaults to `https://app.posthog.com`) |
| `VITE_APP_VERSION` | No | Sentry release tag |

Create `.env.local` in `packages/ui/` for local overrides.

## Code Conventions

- TypeScript strict mode across all packages
- Pure functions in domain (no side effects, no async)
- Type-only imports for interfaces (`import type { X } from './db'`)
- Dexie transactions for multi-table mutations
- `useLiveQuery` from dexie-react-hooks for reactive IndexedDB reads
- `waitFor` from Testing Library for async assertions (never `setTimeout` in tests)
