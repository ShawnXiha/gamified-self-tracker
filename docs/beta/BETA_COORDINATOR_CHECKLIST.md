# Beta Coordinator Checklist
**Your Guide to Running a 3-Day Beta Test for the Gamified Self-Tracker MVP**

Follow these steps carefully to ensure you get high-quality, comparable data from your testers without overwhelming them.

## Pre-Beta Preparation
*   [ ] Deploy the MVP to a static host (e.g., Vercel, Netlify).
*   [ ] Open the live URL on your phone and laptop to verify it loads.
*   [ ] Install the app to your Home Screen (PWA) to ensure the manifest works.
*   [ ] Create a Google Form, Typeform, or Tally using the `FINAL_BETA_FEEDBACK_FORM.md`.
*   [ ] Recruit 5-10 testers who fit the "Aspirational Tracker" profile (people who *want* habits but struggle to stick to them).
*   [ ] Set up a tracking spreadsheet to log Daily Feedback and Bug Reports.

## Day 0: The Invitation
*   [ ] Send the testers the `BETA_TESTER_GUIDE.md` and the `KNOWN_LIMITATIONS.md`.
*   [ ] Provide the live URL.
*   [ ] Send a quick message: "Hey! The 3-day test starts tomorrow. Please open the link, read the guide, and set up your first 2 easy habits today."

## Day 1: Activation
*   [ ] Send the `DAILY_FEEDBACK_TEMPLATE.md` at 5 PM.
*   [ ] "Hi! Did you get a chance to check off your habits today? Please reply with the quick Daily Feedback template when you have a second."
*   [ ] Log all feedback in your spreadsheet.
*   [ ] Check analytics dashboard (e.g., Vercel Web Analytics) for `app_opened` and `habit_created` events.

## Day 2: The Return
*   [ ] Send a quick message at 5 PM.
*   [ ] "Day 2! Did you see your streak flame today? Let me know using the Daily Feedback template."
*   [ ] Monitor for bug reports using the `BUG_REPORT_TEMPLATE.md`.
*   [ ] Check analytics for Day 2 `check_in_completed` retention.

## Day 3: Resilience & Exit
*   [ ] Send the link to the Final Beta Feedback Form.
*   [ ] "Last day of the test! Thanks for your help. Please fill out this 2-minute survey: [Link]"
*   [ ] Track completion rates and gently follow up with stragglers.

## Post-Beta Analysis
*   [ ] Calculate **Activation Rate:** (Habits Created / App Opens on Day 1).
*   [ ] Calculate **Day 2 Retention:** (Users who checked in on Day 2 / Total users on Day 1).
*   [ ] Calculate **Installation Rate:** (Users who successfully added the PWA to Home Screen / Total Users).
*   [ ] Review the Qualitative Feedback from the Final Form.
*   [ ] Identify the Top 2 friction points reported.
*   [ ] Review all Bug Reports.
*   [ ] Decide on the V1.0 roadmap based on the data.