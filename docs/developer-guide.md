# Developer Guide — Gamified Self-Tracker

## Architecture Overview

Three-package monorepo with strict layering:

```
packages/
├── domain/      Pure TypeScript — zero framework dependencies
├── storage/     IndexedDB via Dexie — React hooks for live queries
└── ui/          React 18 SPA — Vite 8, Tailwind CSS 4, PWA
```

**Dependency rule:** `domain ← storage ← ui`. Domain has no React or async deps. Storage depends on domain. UI depends on both storage and domain.

## Getting Started

```bash
git clone <repo-url>
cd gamified-self-tracker
npm install
cd packages/ui && npm run dev
```

### Requirements

- Node.js 18+
- npm 9+

## Package Details

### domain (`packages/domain/`)

Pure business logic. No side effects, no async, no React.

| File | Purpose |
|------|---------|
| `date-engine.ts` | Logical date (04:00 AM boundary), day gap calculation, 7-day window |
| `scoring-engine.ts` | `calculateXP(streak)`, `calculateLevel(totalXP)`, `calculateProgressToNextLevel(totalXP)` |
| `streak-engine.ts` | `evaluateLogicalDay()`, `applyDailyOutcome()` — streak state machine with freeze logic |

Tests: `npm test` in packages/domain (Vitest, 37 tests)

### storage (`packages/storage/`)

IndexedDB persistence via Dexie 4. Provides React hooks using `dexie-react-hooks`.

| File | Purpose |
|------|---------|
| `db.ts` | Dexie schema — 4 tables (habits, checkIns, streaks, userStats), indexes, unique constraints |
| `hooks.ts` | `useHabits`, `addHabit`, `useCheckIn`, `useStreak`, `useUserStats`, `toggleCheckIn`, `useWeeklySummary` |
| `nightly-job.ts` | `runNightlyEvaluation()` — auto-evaluates missed days, consumes freezes, breaks streaks |

Tests: `npm test` in packages/storage (Vitest + fake-indexeddb, 24 tests)

### ui (`packages/ui/`)

React 18 SPA with Tailwind CSS 4 and PWA support.

| Component | Purpose |
|-----------|---------|
| `App.tsx` | Boot sequence: nightly evaluation → render habit list + header |
| `GamificationHeader.tsx` | Displays current level + XP progress bar |
| `HabitList.tsx` | Renders habits with empty state |
| `DailyCheckInItem.tsx` | Checkbox toggle + streak flame + XP toast |
| `CreateHabitForm.tsx` | Input + Add button |
| `LevelProgressBar.tsx` | CSS-animated progress bar |
| `StreakFlame.tsx` | Fire emoji + streak count |
| `XPToast.tsx` | Floating +XP/-XP animation (Level Up variant) |
| `WeeklySummaryModal.tsx` | Monday summary modal with stats |
| `ErrorBoundary.tsx` | Crash recovery with reload button |

Tests: `npm test` in packages/ui (Vitest + jsdom, 14 tests)

## Data Flow

### Check-In Flow

```
User taps checkbox
  → DailyCheckInItem.handleChange()
    → toggleCheckIn(habitId)
      → getLogicalDate() from domain
      → Dexie transaction:
        1. Get/init userStats
        2. Get/init streakState
        3. Check for existing check-in
        4. If ADDING: calculateXP(streak) from domain, update XP/level/stats
        5. If REMOVING: revert XP/level/stats
        6. Update streak, check milestones, award freezes
      → return { action, xp, leveled_up }
    → XPToast displays +XP or "Level Up!"
    → GamificationHeader re-renders via useUserStats()
```

### Nightly Evaluation Flow

```
App mounts → useEffect → runNightlyEvaluation()
  → Calculate gap between last_evaluated_date and today
  → For each missed day:
    - Gather active habits + check-ins for that day
    - Call evaluateLogicalDay() from domain
    - Consume freeze if available, or break streaks
  → Update last_evaluated_date
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

## Testing

```bash
# All tests
npm test

# Per package
cd packages/domain && npm test    # 37 tests — pure logic, milliseconds
cd packages/storage && npm test   # 24 tests — IndexedDB via fake-indexeddb
cd packages/ui && npm test        # 14 tests — component tests via jsdom
```

### Test Strategy

- **Domain**: Input/output contracts. Every engine function has tests for normal, edge, and error cases.
- **Storage**: Schema creation, CRUD operations, transaction atomicity, hook reactivity. Uses `fake-indexeddb/auto` for in-memory DB.
- **UI**: Component rendering, user interactions, mock storage hooks. Uses `jsdom` environment with `@testing-library/react`.

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
- `dist/assets/index-*.js` — bundled JS (~452 KB)
- `dist/assets/index-*.css` — Tailwind CSS (~15 KB)
- `dist/sw.js` — Workbox service worker
- `dist/manifest.webmanifest` — PWA manifest

## Adding a Feature

1. **Domain first**: Add pure functions with tests in `packages/domain/src/`
2. **Persistence**: Add DB schema changes + hooks in `packages/storage/src/`
3. **UI last**: Add components consuming the hooks in `packages/ui/src/components/`

Example: adding a "habit streak bonus" feature:
1. `domain/src/scoring-engine.ts` — add `calculateStreakBonus(streak): number`
2. `domain/src/__tests__/scoring-engine.test.ts` — add test cases
3. `storage/src/hooks.ts` — call bonus in `toggleCheckIn`
4. `ui/src/components/XPToast.tsx` — display bonus in toast

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SENTRY_DSN` | No | Sentry error reporting (no-op if unset) |
| `VITE_POSTHOG_KEY` | No | PostHog analytics (no-op if unset) |

Create `.env.local` in `packages/ui/` for local overrides.

## Code Conventions

- TypeScript strict mode across all packages
- Pure functions in domain (no side effects, no async)
- Type-only imports for interfaces (`import type { X } from './db'`)
- Dexie transactions for multi-table mutations
- `useLiveQuery` from dexie-react-hooks for reactive IndexedDB reads
- `waitFor` from Testing Library for async assertions (never `setTimeout` in tests)
