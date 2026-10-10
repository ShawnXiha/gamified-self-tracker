# Architecture (MVP)

## Status
Locked

## Technical Direction
The MVP is a local-first web application designed to run entirely offline via IndexedDB, wrapped as a Progressive Web App (PWA).

### Stack Decisions
- **Client**: Vanilla HTML/JS/CSS or lightweight frontend framework (e.g., React/Vite, Vue, or Svelte). *Recommendation: React+Vite for rapid component iteration.*
- **Storage**: IndexedDB for local-first persistence. *Recommendation: `idb` or `dexie` library to avoid raw IndexedDB verbosity.*
- **State Management**: Simple state store (e.g., Zustand or Vue Reactivity). No complex Redux for MVP.
- **UI Architecture**: Abstract UI only. No 3D models or heavy SVG assets. Gamification is achieved via CSS progress bars, toasts (`+12 XP`), color-coded flame icons for streaks, and level badges.

### Domain Logic Isolation
Because the app relies heavily on dates, streaks, and scoring math, we must isolate these pure functions from the React/Vue components.

**`packages/domain/`**
- `date-engine.ts`: Contains `getLogicalDate(timestamp)`, which enforces the `04:00 AM` rule, plus day-gap arithmetic, the 7-day window, and Monday detection. *Nothing else in the app should call `new Date()` directly for business logic.*
- `scoring-engine.ts`: Contains `calculateXP(streakCount)` (purely additive: +10 Base + Streak Bonus), `calculateLevel(totalXP)`, and `calculateProgressToNextLevel(totalXP)`.
- `streak-engine.ts`: Contains `evaluateLogicalDay(input)` only — it classifies a single logical day as `no_scheduled_habits`, `streak_kept`, or `missed_all_scheduled` — plus its types (`LogicalDayInput`, `DailyOutcome`). No streak/freeze math lives here anymore.
- `derive-engine.ts`: The derivation core. `deriveTotalXP(checkIns)` (XP = Σ awarded_xp), `deriveStreakStats(checkInDates, freezeDates, startDate, today)` (current + longest streaks and 7-day milestone awards, freeze-aware), `deriveLevelUpAwards(level)`, `deriveFreezesAvailable(level, milestoneAwards, consumedCount)`.

*Testing requirement:* Every engine function lives in `packages/domain` with unit tests (Vitest) covering normal, edge, and error cases; the storage services that call them are integration-tested on top.

### The Derived-State Model

The app's state machine rests on four rules:

- **`checkIns` is the single source of truth.** Every XP, level, and streak number in the app is a pure function of the check-in rows (plus habit creation dates and the freeze ledger). Nothing is stored "per increment" anymore.
- **`streaks` and `userStats` are derived caches.** They are rebuilt from the source of truth inside the same transaction that changes it (in `check-in-service.ts`), and the React hooks read them for reactivity. They are materialized views — rebuildable at any time with zero loss.
- **`freezeEvents` is an append-only ledger of consumed freezes.** Only the nightly evaluator appends rows (one per `missed_all_scheduled` day with a freeze available); nothing ever edits or deletes them.
- **The nightly evaluator's only persistent decision is appending consumed freeze events.** Everything else it does — evaluating past days via `evaluateLogicalDay`, breaking streaks (implicitly, by not appending), and advancing the `last_evaluated_date` checkpoint — is either a pure calculation or cache maintenance. This is what makes it idempotent: a freeze is consumed exactly once.

### The No-Backend Promise
- All data stays on the device.
- "Sync" is out of scope for MVP.
- To prevent data loss, the app ships a "Export Backup (JSON)" button (`storage/src/backup.ts` — one tap downloads a versioned snapshot of every table). Backup import/restore is out of scope for now.

### The No-Retroactive-State Promise
Because retroactive logging is blocked, the state machine is significantly simpler.
- Streaks only ever move forward (or break).
- XP is the Σ of `awarded_xp` over all check-ins — it only ever goes up while checking in. Removing today's check-in (or permanently deleting a habit) honestly falls back to the sum of the remaining rows: a correction, not a penalty.
- We do not need a complex event-sourcing replay system to recalculate the past week if a user forgot to log Tuesday. Tuesday is gone (unless saved by a Streak Freeze).