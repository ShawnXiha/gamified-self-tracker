# Constitution

## Project Name
Gamified Self-Tracker

## Mission
Help users build consistency through low-friction self-tracking, habit completion, and game-like scoring feedback.

## Product Vision
This product should make self-improvement feel lightweight, visible, and rewarding.
The app is not a social network, not a hardcore RPG, and not a complex productivity suite.
Its value comes from helping users return every day, complete small actions, and understand their progress.

## Target Users
- Users who want lightweight daily self-tracking
- Users trying to build or maintain habits
- Users motivated by visible progress, scores, streaks, and leveling
- Users who dislike overly complex productivity systems

## Primary User Problem
Most habit and self-tracking apps fail because:
1. logging is too heavy,
2. rewards are too vague,
3. progress is not emotionally satisfying,
4. a missed day feels like failure instead of a recoverable setback.

## Core Product Promise
In under 2 minutes per day, a user can:
1. see what matters today,
2. record what they did,
3. receive clear score feedback,
4. preserve or recover momentum.

## Non-Goals
This MVP will NOT include:
- social feed
- team challenges
- marketplace / shop economy
- PvP / leaderboard
- complicated avatar or equipment systems
- AI coaching as a core dependency
- multi-device sync as a launch blocker

## Product Principles
1. Low friction over feature volume (Binary completion: yes/no only)
2. Daily return loop over one-time excitement
3. Clear scoring over hidden logic (Additive XP only, no negative scores)
4. Recovery over punishment (Auto-freezes, never zero-out XP)
5. Local-first reliability over backend complexity (PWA + IndexedDB)
6. Explainable progress over decorative gamification (Abstract gamification: bars, toasts, numbers instead of 3D characters)
7. The Present over the Past (Retroactive logging is blocked; focus only on the current logical day)
8. Separation of concerns: Streaks track presence (minimum effort), Scores track mastery (total effort)

## Core Loop
Plan → Check In → Score → Reflect → Continue

Detailed loop:
1. User opens app and sees today's habits/tasks
2. User completes or skips a habit
3. System updates score, streak, and level progress
4. User sees immediate feedback
5. App suggests the next action or tomorrow's continuation

## MVP Scope
The MVP must support:
- creating habits
- viewing today's habits
- marking habits with binary completion (Complete / Missed)
- deterministic XP calculation and linear leveling
- maintaining streak state
- automated streak freezes and 4:00 AM grace period
- showing daily summary and simple progression feedback

## MVP Out of Scope
- cloud sync
- friend system
- complex quest trees
- virtual economy
- rich customization
- long-term recommendation engine

## Success Metrics
Primary:
- Day-1 check-in completion rate
- 7-day return rate
- average habits completed per active day
- streak preservation rate
- weekly reflection completion rate

Secondary:
- average time to complete daily check-in
- percentage of users who create at least 3 habits
- percentage of users who recover after a missed day

## UX Principles
- The daily screen is the center of the product
- Users should always know:
  - what to do now,
  - what they earned,
  - what they risk losing,
  - how to recover
- The scoring explanation must be visible and concise
- Missing one day must not feel catastrophic

## Technical Direction
- Ship the MVP first as a Progressive Web App (PWA)
- IndexedDB for local-first structured storage (No backend required)
- Product-day boundary is 04:00 local time (chronological day ends at 03:59:59 next day)
- Clean domain model for habits, check-ins, score events, and streak state
- Separate scoring logic from UI rendering
- Event instrumentation from the beginning
- Modular structure so streak/scoring systems can evolve without rewriting screens

## Architecture Guardrails
- Keep domain logic independent from UI
- Store scoring rules in testable modules
- Avoid embedding business rules directly in screen components
- Prefer simple state flows over premature abstraction
- Add analytics events only for meaningful product decisions

## Roadmap
### MVP
- daily habit list
- check-in flow
- scoring engine
- streak engine
- daily summary

### v1
- weekly summary
- recovery mechanic
- goal categories
- backup / account export

### v1.5
- sync
- challenge modes
- deeper progression system
- personalized nudges

## Quality Standard
A feature is not complete unless:
1. scope is documented,
2. acceptance criteria are explicit,
3. tests exist for domain logic,
4. edge cases are covered,
5. score/streak behavior is explainable in product language.

## Team Working Agreement
For every non-trivial feature:
1. write or refine spec first,
2. break implementation into small tasks,
3. implement with test-first bias,
4. verify behavior before claiming completion,
5. replan after each major feature.