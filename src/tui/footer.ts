/**
 * Telos TUI status integration.
 *
 * Pi exposes lightweight footer/status slots through the interactive command
 * context (`ctx.ui`). Telos uses a status slot instead of replacing the whole
 * footer so it composes with other extensions and the built-in footer.
 *
 * v0.3.0 enhancements:
 * - Truncated chain primary goal (avoids long objectives dominating the footer)
 * - Sub-goal progress indicator (e.g., "2/5 done")
 * - Generation tracking for goal chains
 * - Cleaner separator layout
 */

import { GoalManager } from "../goal-manager.js";
import { GoalChainManager, type GoalChain } from "../goal-chain.js";

interface GoalStatusContext {
	ui?: {
		setStatus?: (key: string, value: string | undefined) => void;
	};
}

const GOAL_STATUS_KEY = "telos-goal";

/** Maximum characters for chain primary goal display */
const MAX_CHAIN_GOAL_CHARS = 30;

/** Maximum characters for goal objective display */
const MAX_GOAL_PREVIEW_CHARS = 40;

/** Status code mapping for compact display */
const STATUS_CODES: Record<string, string> = {
	active: "A",
	paused: "P",
	blocked: "B",
	complete: "✓",
	budget_limited: "⌀",
};

/** Chain status code for compact display */
const CHAIN_STATUS_CODES: Record<string, string> = {
	active: "⚡",
	paused: "⏸",
	complete: "✓",
	evolving: "⟳",
};

/**
 * Truncate text to a max length with ellipsis.
 */
function truncate(value: string, maxLen: number): string {
	const cleaned = value.trim().replace(/\s+/g, " ");
	return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

/**
 * Compute sub-goal progress string (e.g., "2/5 done", "0/5 active").
 */
function formatSubGoalProgress(chain: GoalChain): string {
	const total = chain.subGoals.length;
	const completed = chain.subGoals.filter((sg) => sg.status === "complete").length;
	const blocked = chain.subGoals.filter((sg) => sg.status === "blocked").length;
	const active = chain.subGoals.filter((sg) => sg.status === "active").length;

	if (total === 0) return "no sub-goals";

	const parts: string[] = [];
	if (completed > 0) parts.push(`${completed}/${total} done`);
	if (active > 0) parts.push(`${active} active`);
	if (blocked > 0) parts.push(`${blocked} blocked`);

	return parts.join(" · ") || `${total} pending`;
}

/**
 * Render the current goal and goal chain status into Pi's extension status area.
 *
 * Safe to call from tool/command event handlers. In non-interactive contexts,
 * or Pi versions without setStatus, this is a no-op.
 */
export function renderGoalFooter(
	ctx: GoalStatusContext | undefined,
	goalManager: GoalManager,
	goalChainManager?: GoalChainManager,
): void {
	const setStatus = ctx?.ui?.setStatus;
	if (typeof setStatus !== "function") {
		return;
	}

	// Build chain status (latest chain by creation time)
	let chainStatus = "";
	if (goalChainManager) {
		const allChains = goalChainManager.getAllGoalChains();
		if (allChains.length > 0) {
			const latestChain = allChains.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
			const chainCode = CHAIN_STATUS_CODES[latestChain.status] ?? "·";
			const truncatedGoal = truncate(latestChain.primaryGoal, MAX_CHAIN_GOAL_CHARS);
			const progress = formatSubGoalProgress(latestChain);
			const genInfo =
				latestChain.currentGeneration > 1 ? ` gen${latestChain.currentGeneration}` : "";
			chainStatus = `${chainCode}${genInfo} ${truncatedGoal} [${progress}]`;
		}
	}

	const goal = goalManager.getGoal();
	if (!goal) {
		setStatus(GOAL_STATUS_KEY, chainStatus || undefined);
		return;
	}

	const statusChar = STATUS_CODES[goal.status] ?? "?";
	const preview = truncate(goal.objective, MAX_GOAL_PREVIEW_CHARS);
	const budgetInfo = goal.tokenBudget ? ` [${goal.tokensUsed ?? 0}/${goal.tokenBudget}]` : "";

	setStatus(
		GOAL_STATUS_KEY,
		`[${statusChar}] ${preview}${budgetInfo}  |  ${chainStatus || "no chain"}`,
	);
}
