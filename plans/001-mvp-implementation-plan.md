# MVP Implementation Plan: 001-mvp-implementation-plan

## Project: Gamified Self-Tracker
**Status:** Locked (Planning Phase)
**Target Stack:** React + TypeScript + Vite PWA + Dexie (IndexedDB)

## 1. Architecture Direction
The architecture enforces strict separation between business logic and React UI. 
- **Domain Layer (`src/domain/`)**: Pure TypeScript functions. No React, no DOM, no asynchronous DB calls. Tests here must be fast and exhaustive.
- **Data Layer (`src/data/`)**: IndexedDB wrapped with Dexie for structured queries. Custom hooks expose reactive database state to the UI.
- **UI Layer (`src/components/`)**: Dumb React components focusing on abstract gamification (colors, bars, numbers) and simple interactions (checkboxes).
- **No Backend**: The app is 100% offline. 

## 2. Phased Implementation Plan
We will build from the inside out. UI will not be touched until the domain logic is fully tested.

- **Phase 1: Pure Domain Engine** (Dates, Scoring, Streaks)
- **Phase 2: Local Persistence** (IndexedDB Schema & Repositories)
- **Phase 3: Core Habit Loop UI** (Creation & Daily Checklist)
- **Phase 4: Abstract Gamification UI** (Level Bar, XP Toasts, Flame Icons)
- **Phase 5: Weekly Summary & Freeze Logic** (Automation & Aggregation)
- **Phase 6: PWA Polish** (Manifest, Service Worker)

---

## 3. Slice-by-Slice Task List & Verification

### Phase 1: Pure Domain Engine

#### Slice 1: The Date Engine (The 04:00 Boundary)
- **Files to Create:**
  - `src/domain/date-engine.ts`
  - `src/domain/__tests__/date-engine.test.ts`
- **Responsibilities:** 
  - `getLogicalDate(timestamp)`: Convert any ISO string/Date into a `YYYY-MM-DD` string based on the 04:00 AM local time boundary.
  - `isToday(logicalDate)`: Compare against the current logical date.
- **Verification:** 
  - Test: Input `2026-04-18T02:30:00` returns `2026-04-17`.
  - Test: Input `2026-04-18T04:00:00` returns `2026-04-18`.

#### Slice 2: The Scoring Engine
- **Files to Create:**
  - `src/domain/scoring-engine.ts`
  - `src/domain/__tests__/scoring-engine.test.ts`
- **Responsibilities:**
  - `calculateXP(streakCount)`: Returns `10 + min(streakCount * 2, 10)`.
  - `calculateLevel(totalXP)`: Returns current level using `XP = 25 * L + L^2 * 2` inverse.
  - `calculateProgressToNextLevel(totalXP)`: Returns XP needed for the next level boundary.
- **Verification:**
  - Test: Level 1 at 0 XP, Level 2 at 50 XP, Level 3 at 120 XP.
  - Test: Streak of 0 returns 10 XP. Streak of 6 returns 20 XP. Streak of 100 returns 20 XP (capped).

#### Slice 3: The Streak & Freeze Engine
- **Files to Create:**
  - `src/domain/streak-engine.ts`
  - `src/domain/__tests__/streak-engine.test.ts`
- **Responsibilities:**
  - `evaluateStreakState(lastCompletedDate, currentDate, freezesAvailable, currentStreak)`: Returns `{ newStreak, freezesRemaining, status: 'Active' | 'Frozen' | 'Broken' }`.
- **Verification:**
  - Test: 1 day missed with 1 freeze -> streak preserved, freeze deducted.
  - Test: 1 day missed with 0 freezes -> streak reset to 0.
  - Test: Multiple consecutive days missed correctly drains multiple freezes before breaking.

### Phase 2: Local Persistence

#### Slice 4: IndexedDB Schema & Repository
- **Files to Create:**
  - `src/data/db.ts` (Dexie setup & schema)
  - `src/data/hooks.ts` (React hooks for querying Dexie)
- **Responsibilities:**
  - Define tables: `habits` (id, title, created_at, archived_at), `checkIns` (id, habit_id, logical_date, completed_at), `userStats` (id, total_xp, current_level, freezes_available).
- **Verification:**
  - Manual verification in browser DevTools (Application > IndexedDB).
  - Component test: Verify a mock React component can insert a habit and read it back.

### Phase 3: Core Habit Loop UI

#### Slice 5: App Shell & Habit CRUD
- **Files to Create:**
  - `src/App.tsx`
  - `src/components/HabitList.tsx`
  - `src/components/CreateHabitForm.tsx`
- **Responsibilities:**
  - Render an empty state. 
  - Form to add a new habit (title only).
  - List unarchived habits.
- **Verification:**
  - Cypress/Playwright (or manual): Add "Drink Water", verify it appears in the list. Persists on refresh.

#### Slice 6: Daily Check-In Toggle (Binary)
- **Files to Create:**
  - `src/components/DailyCheckInItem.tsx`
- **Responsibilities:**
  - Render a checkbox.
  - On toggle: Create or delete a `DailyCheckIn` record for the current *logical date*.
  - No navigation to previous days allowed.
- **Verification:**
  - Clicking checkbox marks it done (persists). Clicking again unmarks it.
  - Creating a check-in at 03:00 AM attaches it to yesterday's logical date.

### Phase 4: Abstract Gamification UI

#### Slice 7: Header & Progress Bar
- **Files to Create:**
  - `src/components/GamificationHeader.tsx`
  - `src/components/LevelProgressBar.tsx`
- **Responsibilities:**
  - Display `Level X` and a CSS width-based progress bar derived from `userStats.total_xp`.
- **Verification:**
  - Manually setting DB `total_xp` to 50 updates header to Level 2.

#### Slice 8: Interaction Feedback (XP Toasts & Streak Flames)
- **Files to Create:**
  - `src/components/XPToast.tsx`
  - `src/components/StreakFlame.tsx`
  - Modify `DailyCheckInItem.tsx`
- **Responsibilities:**
  - Calculate XP gained on toggle using `scoring-engine` and `streak-engine`.
  - Update `userStats` DB transactionally.
  - Trigger floating `+12 XP` CSS animation on the checkbox location.
  - Display `🔥 3` next to habit title if streak > 0.
- **Verification:**
  - Checkbox toggle immediately updates the header progress bar and shows floating text.
  - Unchecking immediately deducts the XP and reverses the progress bar.

### Phase 5: Weekly Summary & Freeze Logic

#### Slice 9: Automated Nightly Evaluation
- **Files to Create:**
  - `src/data/nightly-job.ts`
  - Modify `src/App.tsx` (Boot check)
- **Responsibilities:**
  - On app load, check the last evaluated logical date.
  - If days were skipped, run `evaluateStreakState()` for the missing days to deduct freezes or break streaks.
  - Update DB accordingly.
- **Verification:**
  - Fast-forward system clock by 2 days. App load should deduct 2 freezes and preserve the streak, OR deduct 0 freezes and reset streak to 0.

#### Slice 10: The Weekly Summary Modal
- **Files to Create:**
  - `src/components/WeeklySummaryModal.tsx`
- **Responsibilities:**
  - Pop up on the first load of a Monday (Logical Date).
  - Display: "Total Habits Completed", "Longest Streak", "Freezes Remaining".
- **Verification:**
  - Test trigger: force `isMonday` logic. UI renders accurate counts from IndexedDB `checkIns` table.

### Phase 6: PWA Configuration

#### Slice 11: Vite PWA Setup
- **Files to Create/Modify:**
  - `vite.config.ts`
  - `public/manifest.json`
  - `public/icons/`
- **Responsibilities:**
  - Enable service worker for offline caching of HTML/JS/CSS.
  - Configure `manifest.json` for "Add to Homescreen" (standalone display).
- **Verification:**
  - Lighthouse PWA audit passes.
  - App loads with Network set to "Offline" in DevTools.

---

## 4. Risks & Mitigations
1.  **State Desync on Toggle Spam**: Rapidly checking/unchecking a habit could cause race conditions in IndexedDB leading to incorrect total XP.
    - *Mitigation*: Wrap XP updates in atomic Dexie transactions. Disable the checkbox briefly during the write operation.
2.  **Timezone Shifts**: Device changing timezones could confuse the logical date.
    - *Mitigation*: In the MVP, rely entirely on the local device clock. Document this as a known limitation for V1, favoring MVP simplicity over complex UTC-offset tracking.
3.  **Strict Mode Double Invocation**: React 18 Strict Mode mounts twice, potentially running the "Nightly Evaluation" twice on boot.
    - *Mitigation*: The nightly job must be fully idempotent. Checking "has this date been evaluated" must occur before processing.

## 5. First Build Definition of Done
The first major MVP tag (v0.1.0) is achieved when:
- [ ] 100% of files in `src/domain/` have passing unit tests.
- [ ] App loads entirely offline (Service Worker active).
- [ ] User can add a habit and check it off.
- [ ] XP calculates correctly based on streaks, and the level bar accurately fills.
- [ ] Changing the device clock past 04:00 AM correctly resets the daily checklist.
- [ ] No negative points, no retro-logging, and no partial states exist in the UI.