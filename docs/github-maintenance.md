# Adaptive GitHub Maintenance

This project now has an automated maintenance workflow (`.github/workflows/github-maintenance.yml`) that runs on an hourly schedule.

## Goal
Keep repository health tasks lightweight and adaptive:

- If project activity is high, maintenance executes more often (up to hourly).
- If project activity is low for sustained periods, maintenance checks back off (about twice per week when idle).
- Interval changes are smoothed using short/long activity windows to avoid abrupt flapping.

## How it works

1. A scheduled workflow runs once per hour.
2. The script (`.github/scripts/github-maintenance.mjs`) computes a weighted activity score from:
   - Commits in the last 7 and 30 days
   - Issue updates in the last 7 and 30 days
3. The score is converted into an interval:
   - `1h` (continuous activity)
   - up to `84h` (low activity, i.e. ~2x per week)
   - Smooth decay/growth is applied by blending the current score with the previous report's score.
4. The workflow only performs maintenance checks when the current run aligns with the computed interval.
5. When maintenance runs, it writes `.github/maintenance/latest-report.json` with:
   - activity statistics
   - open/stale issue and PR counts
   - recent failing workflow runs

## Tuning

- `LOOKBACK_DAYS_30` and `ISSUE_STALE_DAYS` live in `.github/scripts/github-maintenance.mjs`.
- Interval smoothing and limits are controlled by:
  - `MIN_INTERVAL_HOURS = 1`
  - `MAX_INTERVAL_HOURS = 84` (roughly twice weekly)

## Current behavior

- Activity thresholds are intentionally conservative and non-destructive.
- Maintenance currently performs health-style checks and report generation only.
- You can extend `run`-time actions in `.github/scripts/github-maintenance.mjs` for additional repository maintenance tasks.