# Known Limitations

Welcome to the Beta! As this is an **MVP (Minimum Viable Product)**, we intentionally kept the feature set as small as possible to focus on the core "habit tracking" loop.

To save you from reporting things that are actually "working as intended" (or just haven't been built yet), please read the list below before submitting bugs or feedback.

## 1. No Cloud Sync / Cross-Device Access
**Status:** Intentional (Local-first)
* All your data is stored securely on your device, inside your browser (using IndexedDB).
* If you use your phone to track a habit, it will **not** show up on your laptop. 
* If you clear your browser data or use Incognito Mode, **your habits, streaks, and XP will be deleted forever.**

## 2. No Custom Habit Schedules
**Status:** Out of Scope for MVP
* Every habit you create is assumed to be a **Daily** habit.
* We currently do not support "3 times a week," "Weekdays only," or "Every Monday."

## 3. No Charts, Graphs, or Deep History
**Status:** Out of Scope for MVP
* The MVP focuses on the *present moment* (Today's check-in, Current Streak, Total XP).
* There is no calendar view or detailed history log to view past months.

## 4. No Push Notifications
**Status:** Out of Scope for MVP
* The app will not ping your phone to remind you to check in.
* We recommend adding it to your Home Screen so you see the icon naturally.

## 5. No Friend Lists or Leaderboards
**Status:** Out of Scope for MVP
* This is a single-player experience designed to motivate you intrinsically with XP and streaks. Social features may come later.

## 6. Habit Deletion
**Status:** Soft-Delete / Archive Only
* When you remove a habit, it is "archived" to preserve your total XP calculation, but it will disappear from your daily list. This is intended behavior.