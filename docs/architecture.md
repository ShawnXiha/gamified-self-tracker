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
- `date-engine.ts`: Contains `getLogicalDate(timestamp)`, which enforces the `04:00 AM` rule. *Nothing else in the app should call `new Date()` directly for business logic.*
- `scoring-engine.ts`: Contains `calculateXP(streakCount)`. Purely additive (+10 Base + Streak Bonus).
- `streak-engine.ts`: Contains `evaluateStreak(lastCompletedDate, currentDate, freezesAvailable)`.

*Testing requirement:* These three files must have 100% test coverage before the UI is built.

### The No-Backend Promise
- All data stays on the device.
- "Sync" is out of scope for MVP.
- To prevent data loss, MVP V1.1 should offer a "Download Backup (JSON)" button.

### The No-Retroactive-State Promise
Because retroactive logging is blocked, the state machine is significantly simpler.
- Streaks only ever move forward (or break).
- XP only ever goes up (or stays flat).
- We do not need a complex event-sourcing replay system to recalculate the past week if a user forgot to log Tuesday. Tuesday is gone (unless saved by a Streak Freeze).