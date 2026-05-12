# Spec 002 - Scoring and Levels

## Title
Abstract Gamification: XP, Levels, and Positive Reinforcement

## Status
Locked (MVP)

## Objective
Define an abstract, deterministic, and additive scoring system.
- Reward consistency and daily effort.
- Avoid all negative points and health bars.
- Rely purely on abstract UI (XP numbers, bars, color changes) to convey progress, not characters or virtual items.

## Product Goals
1. Reward completion with fixed base points.
2. Provide a streak multiplier to make continuity mathematically valuable.
3. No retroactive punishment (missed days = 0 points).
4. No difficulty modifiers for MVP (keep math explainable in a single sentence).

## Core Rule Set

### 1. Base Score
A single flat rate for completing any habit on the current logical day.
- **Complete:** `+10 XP`
- **Missed:** `0 XP`

*Rationale:* The punishment for missing is the lost opportunity of 10 XP and a streak bonus, not a retroactive deduction of your lifetime total.

### 2. Consistency Bonus
A bonus applied on top of the base score to make consecutive days feel rewarding.
- **+2 XP** per active day of the current streak.
- **Capped at +10 XP** maximum.

*Examples:*
- Day 1: +10 Base + (0) Bonus = `10 XP`
- Day 2: +10 Base + (2) Bonus = `12 XP`
- Day 3: +10 Base + (4) Bonus = `14 XP`
- Day 6: +10 Base + (10) Bonus = `20 XP` (Cap reached)

### 3. Leveling Curve
Levels exist to provide long-term, structural goals for the XP accumulated.
- **Formula:** `XP_Required = 25 * level + (level^2 * 2)`
- Level 1: 0 XP (Start)
- Level 2: 50 XP
- Level 3: 120 XP
- Level 4: 218 XP
- Level 5: 350 XP

### 4. Abstract Gamification UI
The UX relies entirely on numbers, shapes, and color to feel rewarding.
- **Immediate Feedback:** A floating text animation (`+12 XP`) appears immediately when the checkbox is tapped.
- **Level Bar:** The header persistently shows the current Level and a progress bar to the next level. `(Current XP - Base XP for this Level) / (Base XP for next Level)`.
- **Streak Flame:** The habit list displays a flame icon `🔥 14` next to active habits. If the streak breaks, the flame turns gray or disappears.

## Recalculation Rules
- If a user taps "Complete" by mistake and unchecks it on the *same day*, the XP is deducted back out of their total, and the streak decrements back.
- Since we block retroactive logging, this recalculation only ever applies to the *current logical day*. We do not need a complex event-sourcing replay for historical dates.

## Acceptance Criteria
1. Marking a habit complete adds exactly `10 XP + (Streak * 2) (Max 10)`.
2. Unchecking a habit on the same day perfectly reverses the XP and Streak gained from that tap.
3. Missing a day does not subtract XP from the user's lifetime total.
4. Level progress bar accurately maps the current XP against the quadratic level thresholds.
5. Reaching a new level triggers an abstract UI celebration (e.g., a toast notification or color flash).
6. Gamification relies on UI primitives (bars, text, icons) rather than asset-heavy sprites.