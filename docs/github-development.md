# GitHub Development Workflow

Telos is set up to use GitHub as part of normal development: issues capture work, pull requests review and merge changes, and the adaptive maintenance workflow reports repository health.

## Prerequisites

Use an installed, authenticated GitHub CLI:

```bash
gh auth status
```

This checkout has been verified with `gh` access to `somebloke1/telos`. The repository metadata in `package.json` points to that repo, so `gh` commands run from this checkout should target the project repository.

## Common commands

Use the package scripts as lightweight wrappers around `gh`:

```bash
npm run github:auth      # confirm GitHub CLI authentication
npm run github:status    # show assigned issues, PRs, and notifications
npm run github:issue     # create a new issue interactively
npm run github:pr        # create a pull request from the current branch using --fill
npm run github:repo      # open the GitHub repository page
```

You can pass extra arguments after `--`, for example:

```bash
npm run github:issue -- --title "Improve goal-chain diagnostics" --body "Describe the requested change."
npm run github:pr -- --title "Improve goal-chain diagnostics" --body "Summary and test plan."
```

## Suggested development loop

1. Create or identify an issue for the work.
2. Create a focused branch and make a small, testable change.
3. Run `npm test` and `npm run check`.
4. Open a PR with `npm run github:pr -- --fill` or with an explicit title/body.
5. Link issues using `Fixes #<issue>` or `Related to #<issue>` in the PR body.

## Automation

The adaptive maintenance workflow in `.github/workflows/github-maintenance.yml` runs repository health checks and writes `.github/maintenance/latest-report.json` when maintenance is due. See [`github-maintenance.md`](github-maintenance.md) for details.
