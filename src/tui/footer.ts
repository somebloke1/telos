/**
 * Telos TUI status integration.
 *
 * Pi exposes lightweight footer/status slots through the interactive command
 * context (`ctx.ui`). Telos uses a status slot instead of replacing the whole
 * footer so it composes with other extensions and the built-in footer.
 */

import { GoalManager } from "../goal-manager.js";

interface GoalStatusContext {
	ui?: {
		setStatus?: (key: string, value: string | undefined) => void;
	};
}

const GOAL_STATUS_KEY = "telos-goal";

/**
 * Render the current goal summary into Pi's extension status area.
 *
 * Safe to call from tool/command event handlers. In non-interactive contexts,
 * or Pi versions without setStatus, this is a no-op.
 */
export function renderGoalFooter(ctx: GoalStatusContext | undefined, goalManager: GoalManager): void {
	const setStatus = ctx?.ui?.setStatus;
	if (typeof setStatus !== "function") {
		return;
	}

	const goal = goalManager.getGoal();
	if (!goal) {
		setStatus(GOAL_STATUS_KEY, undefined);
		return;
	}

	const status = goal.status.toUpperCase();
	const preview = goal.objective.trim().replace(/\s+/g, " ");
	const truncatedPreview = preview.length > 50 ? `${preview.slice(0, 49)}…` : preview;
	const budgetInfo = goal.tokenBudget
		? ` ${goal.tokensUsed ?? 0}/${goal.tokenBudget}`
		: "";

	setStatus(GOAL_STATUS_KEY, `Goal ${status}: ${truncatedPreview}${budgetInfo}`);
}
