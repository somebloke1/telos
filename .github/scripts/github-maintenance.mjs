#!/usr/bin/env node
/**
 * Adaptive GitHub maintenance helper for telos.
 *
 * Runs as a CI job and decides whether to execute maintenance checks based on
 * recent repository activity. Activity changes the interval smoothly:
 * - quiet periods => slower checks (roughly twice per week)
 * - busy periods => frequent checks (hourly)
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const API_BASE = "https://api.github.com";
const MIN_INTERVAL_HOURS = 1;
const MAX_INTERVAL_HOURS = 84; // twice per week
const LOOKBACK_DAYS_30 = 30;
const ISSUE_STALE_DAYS = 30;
const SCORE_SMOOTHING_WEIGHT = 0.25;

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;

if (!repo) {
	throw new Error("GITHUB_REPOSITORY is required");
}

if (!token) {
	throw new Error("GITHUB_TOKEN is required");
}

const [owner, repoName] = repo.split("/");

const headers = {
	Accept: "application/vnd.github+json",
	Authorization: `Bearer ${token}`,
	"X-GitHub-Api-Version": "2022-11-28",
	"User-Agent": "telos-maintenance-bot",
};

function nowDate() {
	return new Date();
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function isoDaysAgo(days) {
	const d = nowDate();
	d.setUTCDate(d.getUTCDate() - days);
	return d.toISOString();
}

function parseJsonResponse(response) {
	if (!response.ok) {
		return response.text().then((text) => {
			throw new Error(`GitHub API request failed (${response.status}): ${text}`);
		});
	}
	return response.json();
}

async function githubRequest(path, params = {}) {
	const url = new URL(`${API_BASE}${path}`);
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null || value === "") continue;
		url.searchParams.set(key, String(value));
	}

	const response = await fetch(url, { headers });
	return parseJsonResponse(response);
}

function countWithin(items, now, days, accessor) {
	const cutoff = new Date(now);
	cutoff.setUTCDate(cutoff.getUTCDate() - days);
	return items.filter((item) => new Date(accessor(item)) >= cutoff).length;
}

function computeActivityScore(commits, issues, now) {
	// Short-window + long-window weighting keeps interval changes smooth.
	const commits30 = commits.length;
	const commits7 = countWithin(commits, now, 7, (item) => item.commit.committer.date);

	const issues30 = issues.length;
	const issues7 = countWithin(issues, now, 7, (item) => item.updated_at);

	const weightedRate7 = (commits7 * 2 + issues7) / 7;
	const weightedRate30 = (commits30 * 2 + issues30) / 30;

	// 4 weighted events/day = "continuous".
	const normalized7 = clamp(weightedRate7 / 4, 0, 1);
	const normalized30 = clamp(weightedRate30 / 4, 0, 1);
	const score = clamp(normalized7 * 0.75 + normalized30 * 0.25, 0, 1);

	return {
		weightedRate7,
		weightedRate30,
		score,
		commits7,
		commits30,
		issues7,
		issues30,
	};
}

function intervalFromActivityScore(score) {
	const smoothScore = Math.pow(score, 1.4); // smooths near-zero/near-one behavior
	return Math.round(MIN_INTERVAL_HOURS + (MAX_INTERVAL_HOURS - MIN_INTERVAL_HOURS) * (1 - smoothScore));
}

function isRunDue(now, intervalHours) {
	if (intervalHours <= 1) {
		return true;
	}

	const hourBucket = Math.floor(now.getTime() / (60 * 60 * 1000));
	return hourBucket % intervalHours === 0;
}

function nextDueDate(now, intervalHours) {
	const nowHour = Math.floor(now.getTime() / (60 * 60 * 1000));
	const nextHour = Math.floor(nowHour / intervalHours) * intervalHours + intervalHours;
	return new Date(nextHour * 60 * 60 * 1000);
}

function setOutput(key, value) {
	if (!process.env.GITHUB_OUTPUT) {
		return;
	}
	appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

function appendSummary(markdown) {
	if (!process.env.GITHUB_STEP_SUMMARY) {
		return;
	}
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

function log(message) {
	console.log(`[github-maintenance] ${message}`);
}

function loadLatestReport() {
	const path = ".github/maintenance/latest-report.json";
	if (!existsSync(path)) {
		return null;
	}

	try {
		const raw = readFileSync(path, "utf8");
		if (!raw || !raw.trim()) {
			return null;
		}
		return JSON.parse(raw);
	} catch (error) {
		log(`Unable to parse previous maintenance report: ${String(error)}`);
		return null;
	}
}

(async () => {
	const runAt = nowDate();

	log(`Starting adaptive maintenance run for ${repo}`);
	log(`Reference time: ${runAt.toISOString()}`);

	const repoInfo = await githubRequest(`/repos/${owner}/${repoName}`);
	const defaultBranch = repoInfo.default_branch || "main";

	const commits = await githubRequest(`/repos/${owner}/${repoName}/commits`, {
		sha: defaultBranch,
		since: isoDaysAgo(LOOKBACK_DAYS_30),
		per_page: 100,
	});

	const issues = await githubRequest(`/repos/${owner}/${repoName}/issues`, {
		state: "all",
		since: isoDaysAgo(LOOKBACK_DAYS_30),
		per_page: 100,
		sort: "updated",
		direction: "desc",
	});

	const pulls = await githubRequest(`/repos/${owner}/${repoName}/pulls`, {
		state: "open",
		per_page: 100,
	});

	const workflowRuns = await githubRequest(`/repos/${owner}/${repoName}/actions/runs`, {
		status: "completed",
		event: "push",
		per_page: 50,
	});

	const openIssueCount = issues.filter((item) => !item.pull_request && item.state === "open").length;
	const staleOpenIssues = issues
		.filter((item) => !item.pull_request && item.state === "open")
		.filter((item) => new Date(item.updated_at) < new Date(isoDaysAgo(ISSUE_STALE_DAYS)));
	const activity = computeActivityScore(commits, issues, runAt);
	const previousReport = loadLatestReport();
	const previousScore =
		previousReport &&
		previousReport.activity &&
		typeof previousReport.activity.score === "number"
			? previousReport.activity.score
			: null;
	const smoothedScore =
		previousScore === null
			? activity.score
			: clamp(previousScore * (1 - SCORE_SMOOTHING_WEIGHT) + activity.score * SCORE_SMOOTHING_WEIGHT, 0, 1);
	const intervalHours = clamp(intervalFromActivityScore(smoothedScore), MIN_INTERVAL_HOURS, MAX_INTERVAL_HOURS);
	const shouldRunMaintenance = isRunDue(runAt, intervalHours);
	const nextRun = shouldRunMaintenance ? runAt : nextDueDate(runAt, intervalHours);

	setOutput("maintenance_interval_hours", intervalHours);
	setOutput("maintenance_should_run", shouldRunMaintenance ? "true" : "false");
	setOutput("maintenance_next_run", nextRun.toISOString());
	setOutput("maintenance_activity_score", smoothedScore.toFixed(3));

	const last24h = new Date(runAt.getTime() - 24 * 60 * 60 * 1000);
	const recentFailures = (workflowRuns.workflow_runs || []).filter((run) => {
		const startedAt = new Date(run.created_at);
		return startedAt >= last24h && run.conclusion && run.conclusion !== "success" && run.conclusion !== "skipped";
	});

	log(`Activity score (raw): ${activity.score.toFixed(3)}`);
	log(`Activity score (smoothed): ${smoothedScore.toFixed(3)}`);
	log(`Computed interval: ${intervalHours}h`);
	log(`Maintenance due now: ${shouldRunMaintenance}`);
	log(`Next scheduled maintenance window: ${nextRun.toISOString()}`);

	if (!shouldRunMaintenance) {
		log("Skipping maintenance run due to adaptive interval.");
		appendSummary(`## GitHub Maintenance\n\n**Status:** skipped\n\n- Interval: ${intervalHours}h\n- Next run: ${nextRun.toISOString()}\n- Activity score (raw): ${activity.score.toFixed(3)}\n- Activity score (smoothed): ${smoothedScore.toFixed(3)}\n`);
		return;
	}

	log("Maintenance window is due. Running checks.");

	const report = {
		repository: repo,
		runAt: runAt.toISOString(),
		branch: defaultBranch,
		activity: {
			score: Number(activity.score.toFixed(3)),
			smoothedScore: Number(smoothedScore.toFixed(3)),
			intervalHours,
			commits7: activity.commits7,
			commits30: activity.commits30,
			issues7: activity.issues7,
			issues30: activity.issues30,
			previousScore,
		},
		checks: {
			openPullRequests: pulls.length,
			openIssues: openIssueCount,
			staleIssues: staleOpenIssues.length,
			recentFailedWorkflows24h: recentFailures.length,
		},
	};

	if (!existsSync(".github/maintenance")) {
		mkdirSync(".github/maintenance", { recursive: true });
	}
	writeFileSync(
		".github/maintenance/latest-report.json",
		`${JSON.stringify(report, null, 2)}\n`,
		"utf8",
	);
	log("Wrote latest maintenance report to .github/maintenance/latest-report.json");

	appendSummary(`## GitHub Maintenance\n\n**Status:** executed\n\n- Repository: ${repo}\n- Branch: ${defaultBranch}\n- Interval used: ${intervalHours}h\n- Activity score (raw): ${activity.score.toFixed(3)}\n- Activity score (smoothed): ${smoothedScore.toFixed(3)}\n\n### Activity\n- Commits (7d / 30d): ${activity.commits7} / ${activity.commits30}\n- Issue updates (7d / 30d): ${activity.issues7} / ${activity.issues30}\n\n### Current checks\n- Open pull requests: ${pulls.length}\n- Open issues: ${openIssueCount}\n- Stale open issues (> ${ISSUE_STALE_DAYS} days): ${staleOpenIssues.length}\n- Failed workflow runs in last 24h: ${recentFailures.length}`);

	if (staleOpenIssues.length > 0) {
		appendSummary(`\n### Stale issues\n${staleOpenIssues
			.slice(0, 10)
			.map((issue) => `- #${issue.number}: ${issue.title}`)
			.join("\n")}`);
	}

	log("Maintenance execution complete.");
})();
