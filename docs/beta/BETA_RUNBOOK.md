# Gamified Self-Tracker MVP - Beta Runbook

This runbook outlines the exact operational procedures for running a 3-day Beta test with 5-10 users. It is designed to be lightweight, informal, and highly focused on capturing core retention metrics and onboarding friction.

---

## 1. Day 0: Setup & Invites
**Goal:** Ensure the environment is live and testers are prepped.

*   **System Setup:**
    1. Deploy the `ui` package to Vercel/Netlify.
    2. Verify PostHog (or your chosen analytics provider) is receiving events in the production environment.
    3. Update the `[Insert Beta URL Here]` and `[Insert Form URL here]` placeholders in the Beta documentation pack.
*   **Tester Recruitment:**
    1. Identify 5-10 people who fit the "Aspirational Tracker" profile (friends, colleagues, or community members).
    2. Choose a direct communication channel (1-on-1 WhatsApp, iMessage, Slack, or Discord DMs are best for a small group; a group chat can cause bias).
*   **The Invite Message:**
    > "Hey! I'm testing a super minimal habit tracker that uses XP and streaks to keep you motivated. It’s a 3-day test starting tomorrow. It takes 30 seconds a day. Are you in? If so, here is the Beta Guide and the link: [Link]"
    *(Attach `BETA_TESTER_GUIDE.md` and `KNOWN_LIMITATIONS.md`)*

---

## 2. Day-by-Day Schedule & Coordinator Checklist

### Day 1: Activation
**What Testers Do:** Open the app, optionally install it to their Home Screen (PWA), add 2 simple habits, and check off their first day.
**Coordinator Daily Checklist:**
- [ ] **Morning:** Send a reminder: "Day 1 starts today! Just tap the link, add 2 easy habits, and check them off."
- [ ] **Afternoon:** Monitor the analytics dashboard for `app_opened` and `habit_created` events.
- [ ] **Evening:** Send the `DAILY_FEEDBACK_TEMPLATE.md` questions via DM to anyone who hasn't reached out.
- [ ] **End of Day:** Tally how many users successfully created habits.

### Day 2: Retention
**What Testers Do:** Return to the app, check off their habits, and observe the streak flame and XP toast.
**Coordinator Daily Checklist:**
- [ ] **Afternoon:** Monitor the analytics dashboard for `check_in_completed` events. Look for `current_streak: 2`.
- [ ] **Evening:** Send a quick DM: "Day 2! Did you check in today? Did you notice the streak flame appear? Any friction so far?"
- [ ] **End of Day:** Log any ad-hoc bug reports or friction points into a tracking spreadsheet.

### Day 3: Resilience & Exit
**What Testers Do:** Open the app, intentionally leave one habit unchecked, and fill out the final feedback form.
**Coordinator Daily Checklist:**
- [ ] **Morning:** Send the final instruction: "Last day! Try leaving one habit unchecked today, but check the other one. Then, please fill out this 2-minute survey: [Form Link]"
- [ ] **Afternoon:** Monitor analytics to see if users are returning for Day 3.
- [ ] **Evening:** Chase down any missing survey responses.
- [ ] **End of Day:** Close the beta officially. "Thank you so much for testing! The beta is now complete."

---

## 3. Feedback & Bug Collection
With 5-10 users, avoid heavy bug trackers like Jira. Use direct messaging.

*   **Bugs:** When a tester reports an issue, ask them to fill out the `BUG_REPORT_TEMPLATE.md` via DM. *Crucial:* Always ask for their Device, OS, and Browser, as IndexedDB behaves differently across platforms.
*   **Qualitative Feedback:** Collected via the lightweight daily DMs and formally structured in the `FINAL_BETA_FEEDBACK_FORM.md` at the end of Day 3.

---

## 4. Metrics Review (Post-Beta)
At the end of Day 3, the Coordinator will open the analytics dashboard (e.g., PostHog) and review the following funnel:

1.  **Unique `app_opened` events (Day 1)** -> Establishes the baseline cohort size.
2.  **`habit_created` events (Day 1)** -> Measures onboarding success.
3.  **`check_in_completed` events (Day 2 & Day 3)** -> Measures core loop retention.
4.  **`is_pwa_installed` properties** -> Measures how many users figured out how to add it to their home screen.

*Compare these metrics directly against the qualitative answers in the Final Feedback Form to identify discrepancies (e.g., "Users said it was easy to use, but only 40% checked in on Day 2").*

---

## 5. Escalation Rules (Mid-Beta Blockers)

If a critical issue is discovered mid-beta, follow these escalation rules.

### What is a Blocker?
*   **Data Wipe:** Users report their habits or XP completely disappearing without clearing their browser cache.
*   **White Screen of Death:** The app fails to load on a specific, common browser (e.g., completely broken on iOS Safari).
*   **Core Loop Failure:** Tapping a checkbox does not award XP or register the check-in.

### The Escalation Protocol
1.  **Assess the Impact:** Is it affecting 1 user or the whole cohort?
    *   *If 1 user:* Log it as a device-specific bug. Ask them to try a different browser. **Do not stop the beta.**
    *   *If all users:* **Halt the beta.**
2.  **Communication:** Send a message to all testers: "Hey everyone, we caught a critical bug with [Issue]. Please pause testing for today while we push a fix."
3.  **Hotfix Window (2 Hours):** The engineering team has 2 hours to deploy a safe, minimal fix. 
    *   If fixed within 2 hours: Deploy, verify, and tell testers to refresh the page. Add 1 day to the Beta schedule.
    *   If NOT fixed within 2 hours: **Abort the current Beta cohort.** Document the failure, spend the necessary time fixing it, and recruit a new cohort the following week. Do not drag testers through a broken experience for days.
4.  **Non-Blockers:** Cosmetic issues, minor animations failing, or awkward UX are **NOT** blockers. Document them as V1.0 improvement tickets and let the beta run its course.