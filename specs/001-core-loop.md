# Spec 001 - Core Daily Loop

## Title
Core Daily Loop: Habit Check-In and Daily Boundary

## Status
Locked (MVP)

## Objective
Deliver the smallest shippable loop that makes the app usable every day as a Progressive Web App (PWA):
- user defines daily habits
- user checks in for the current day
- system calculates daily score and streak updates
- user sees immediate UI feedback (abstract gamification)

## UX Flow
1. User opens app.
2. User sees today's habits.
3. User taps a habit to toggle it to "Complete".
4. UI updates immediately (check mark, strikethrough).
5. Score and streak update immediately via floating abstract UI (e.g., "+10 XP" toast).

## Core Domain Rules

### 1. Binary Completion
Habits have only two states for a given day:
- **Complete**
- **Missed** (Default state if not completed by the end of the day)

There is no "partial" or "skipped" state in the MVP. UI is a simple one-tap checkbox.

### 2. The Logical Day Boundary (04:00 AM)
To prevent midnight panic, a "logical day" runs from `04:00:00` local time to `03:59:59` the next calendar day.
- e.g., A check-in at `Tuesday 01:30 AM` counts for `Monday`.
- The UI should display "Monday" when the user is operating in that 00:00 - 03:59 window.

### 3. No Retroactive Logging
Users can ONLY check off habits for the *current logical day*.
- The UI does not provide navigation to previous days to toggle past habits.
- If the 04:00 AM boundary passes, yesterday's uncompleted habits are permanently locked as "Missed" (unless saved by a Streak Freeze).
- *Rationale:* Drastically simplifies the state machine. No historical recalculations of streaks or XP are required.

## Data Model (Local-First IndexedDB)

### Habit
- `id`: string (UUID)
- `title`: string
- `created_at`: timestamp
- `archived_at`: timestamp | null

### DailyCheckIn
- `id`: string
- `habit_id`: string
- `logical_date`: string (YYYY-MM-DD format, calculated based on the 4AM boundary)
- `completed_at`: timestamp

*(Note: "Missed" is simply the absence of a DailyCheckIn record for a scheduled logical_date)*

### StreakState
- `habit_id`: string
- `current_streak`: number
- `best_streak`: number
- `last_completed_date`: string (YYYY-MM-DD)

## Acceptance Criteria
1. User can create a habit.
2. User can tap to complete a habit for the current logical day.
3. Tapping completion is binary (on/off).
4. System determines the current logical date using the 04:00 AM offset.
5. User cannot edit statuses for days prior to the current logical date.
6. Check-ins persist locally across app reloads via IndexedDB.