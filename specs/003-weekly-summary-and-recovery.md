# Spec 003 - Weekly Summary and Streak Recovery

## Title
Weekly Summary, Streak Freezes, and Recovery Mechanics

## Status
Locked (MVP)

## Objective
Prevent user churn caused by the "Abstinence Violation Effect" (the "What The Hell" effect) when a streak is broken. Provide a forgiving, local-first recovery system (via IndexedDB) that emphasizes resilience over perfection.

## Why This Feature Exists
Habit trackers lose the most users exactly when they break a long streak. If the system is too rigid, missing one day feels like all prior effort was wasted. By introducing automated streak freezes and a weekly reflection that celebrates totals rather than just current streaks, we shift the user's mindset from "don't break the chain" to "always bounce back."

## Product Goals
1. Provide a safety net for missed days (Streak Freezes).
2. Automate the safety net so the user doesn't have to log in to "pause" their streak.
3. Frame progress around aggregate consistency (Total Days) alongside consecutive consistency (Streaks).
4. Keep the math deterministic and entirely client-side.

## Non-Goals
- Complex "Sick Leave" or "Vacation Mode" calendars for MVP.
- Paid streak repairs or microtransactions.
- Manual retroactive streak repair tasks (e.g., "Do 3x effort to fix yesterday") for MVP—keep it simple with auto-freezes first.
- AI-generated weekly insights.

## Core Rule Set

### 1. The Day Boundary (The 4:00 AM Rule)
To prevent midnight panic, a "logical day" for tracking purposes runs from `04:00:00` local time to `03:59:59` the next day.
- Actions completed at 01:30 AM on Tuesday count toward Monday's check-in.

### 2. Streak Freezes (The Safety Net)
**Inventory:**
- Users start with **2 Streak Freezes** on day one.
- Maximum inventory is **5 Freezes**.

**Earning Freezes:**
- Users earn **1 Freeze** every time they level up (per Spec 002).
- (Alternative MVP rule: Earn 1 Freeze for every 7 consecutive days of active check-ins).

**Auto-Consumption:**
- If a user misses all scheduled habits for a logical day, the system checks the freeze inventory.
- If `inventory > 0`, deduct 1 freeze.
- The missed day's status becomes `Frozen`.
- The `current_streak` count remains unchanged (it does not increment, but it does not reset to 0).

### 3. Streak Break
If a user misses a day and `inventory == 0`:
- The streak is broken and resets to `0`.
- The UI acknowledges the end of the streak positively using abstract UI (e.g., a toast: "You kept a 14-day streak! That's a great baseline to beat.").
- `best_streak` is updated if the broken streak was a personal best.

### 4. Weekly Summary
Generated locally every Sunday at the end of the logical day (Monday 4:00 AM).
**Data Displayed:**
- **Habits Completed:** e.g., "18 / 21 scheduled habits"
- **Consistency Rate:** e.g., "85%"
- **Total Lifetime Days:** "You've shown up for 42 days total."
- **Longest Streak:** "Your best is 14 days."
- **Freezes Remaining:** "You have 3 Freezes ready for next week."

## Edge Cases
- **Multiple Missed Days**: If a user is gone for 3 days and has 3 freezes, all 3 are consumed sequentially. If they have 2 freezes, the first 2 days are frozen, and the 3rd day breaks the streak.
- **No Scheduled Habits**: If a day has no habits scheduled, a freeze is NOT consumed, and the streak does NOT break.
- **Timezone Travel**: For MVP, use the device's local clock to determine the 4:00 AM boundary. If traveling causes a weird overlap, the freeze inventory acts as the buffer against unfair streak breaks.

## Acceptance Criteria
1. User starts with 2 freezes.
2. Missing a day with freezes > 0 consumes 1 freeze and does not reset the streak.
3. Missing a day with 0 freezes resets the streak.
4. Earning a level (or 7-day milestone) adds 1 freeze, capping at 5.
5. The Weekly Summary accurately aggregates the past 7 logical days of data.
6. Actions between Midnight and 3:59 AM attribute to the previous calendar day.

## Verification Plan
- **Unit Tests**:
  - `DayBoundary` calculations across edge-case hours (e.g., 03:59 vs 04:01).
  - `FreezeConsumption` engine: Given an array of missed days and X freezes, assert the correct final streak and freeze balance.
  - `FreezeCap`: Assert inventory never exceeds 5.
- **Integration Tests**: Simulate a week of check-ins, advance the system clock, and assert the Weekly Summary outputs the correct percentages and totals.

## Future Extensions (Post-MVP)
- **Active Repair Missions**: If a streak breaks, give the user 48 hours to do a "3x effort" day to win the streak back.
- **Vacation Mode**: Manually pause the tracker for up to 2 weeks without consuming freezes.