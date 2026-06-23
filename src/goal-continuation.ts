/**
 * Goal Continuation
 *
 * Manages automatic continuation when a goal is active and the session is idle.
 * Inspired by Codex's continuation steering and automatic turn initiation.
 */

import type { GoalManager } from "./goal-manager.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export class GoalContinuation {
	private continuationEnabled = false;
	private continuationInProgress = false;
	private lastContinuationTime = 0;
	private readonly MIN_CONTINUATION_INTERVAL = 2000; // 2 seconds between continuations

	constructor(
		private goalManager: GoalManager,
		private pi: ExtensionAPI,
	) {}

	/**
	 * Enable automatic continuation
	 */
	enableContinuation(): void {
		this.continuationEnabled = true;
	}

	/**
	 * Disable automatic continuation
	 */
	disableContinuation(): void {
		this.continuationEnabled = false;
	}

	/**
	 * Check if continuation is enabled
	 */
	isContinuationEnabled(): boolean {
		return this.continuationEnabled;
	}

	/**
	 * Immediately request a continuation turn for the current active goal.
	 * Used by /goal create and /goal resume so setting a goal springs the agent into action.
	 */
	async triggerNow(ctx: any): Promise<void> {
		const goal = this.goalManager.getGoal();
		if (!goal || goal.status !== "active") {
			return;
		}

		this.continuationEnabled = true;
		await this.triggerContinuation(goal, ctx);
	}

	/**
	 * Check if we should trigger continuation after a turn ends
	 */
	async checkContinuation(ctx: any): Promise<void> {
		// Don't continue if:
		// - Continuation is disabled
		// - A continuation is already in progress
		// - Not enough time has passed since last continuation
		// - Agent is not idle
		// - No active goal or goal is not in active state

		if (!this.continuationEnabled) {
			return;
		}

		if (this.continuationInProgress) {
			return;
		}

		const now = Date.now();
		if (now - this.lastContinuationTime < this.MIN_CONTINUATION_INTERVAL) {
			return;
		}

		if (!ctx.isIdle()) {
			return;
		}

		const goal = this.goalManager.getGoal();
		if (!goal) {
			return;
		}

		// Only continue if goal is active
		if (goal.status !== "active") {
			return;
		}

		// Trigger continuation
		await this.triggerContinuation(goal, ctx);
	}

	/**
	 * Trigger a continuation turn
	 */
	private async triggerContinuation(goal: any, ctx: any): Promise<void> {
		this.continuationInProgress = true;
		this.lastContinuationTime = Date.now();

		try {
			// Inject continuation steering message
			const steeringMessage = this.buildContinuationMessage(goal);
			this.pi.sendUserMessage(steeringMessage);
		} catch (error) {
			// Log error but don't throw
			console.error("Failed to trigger continuation:", error);
		} finally {
			this.continuationInProgress = false;
		}
	}

	/**
	 * Build continuation steering message
	 */
	private buildContinuationMessage(goal: any): string {
		const lines = [
			"CONTINUATION: You are continuing work on the active goal.",
			"",
			"Current Goal:",
			goal.objective,
			"",
			"Instructions:",
			"- Continue working toward the goal objective.",
			"- Preserve the full context and progress made so far.",
			"- Work from evidence and files you've already examined.",
			"- Keep your plan current as you discover new information.",
			"- Audit completion requirement-by-requirement.",
			"- Only call update_goal with status 'complete' when the goal is truly finished.",
			"- Only call update_goal with status 'blocked' if you cannot proceed despite trying multiple approaches.",
		];

		if (goal.tokenBudget) {
			const stats = this.goalManager.getStats();
			const remaining = stats?.budgetRemaining ?? goal.tokenBudget - (stats?.tokensUsed ?? 0);
			const percent = Math.round((remaining / goal.tokenBudget) * 100);

			lines.push("");
			lines.push("Token Budget:");
			lines.push(`- Remaining: ${remaining} tokens (${percent}% of budget)`);
			lines.push("- Be mindful of token usage and prioritize efficiently.");
		}

		return lines.join("\n");
	}

	/**
	 * Handle goal updates (e.g., when LLM marks goal complete or blocked)
	 */
	async handleGoalUpdate(event: any, ctx: any): Promise<void> {
		const result = event.result;

		// If goal was marked complete or blocked, disable continuation
		if (result?.details?.updated) {
			const newStatus = result.details.newStatus;
			if (newStatus === "complete" || newStatus === "blocked") {
				this.continuationEnabled = false;
			}
		}
	}

	/**
	 * Inject budget limit steering when budget is exhausted
	 */
	injectBudgetLimitSteering(goal: any, ctx: any): void {
		const steeringMessage = [
			"BUDGET LIMIT REACHED: The token budget for this goal has been exhausted.",
			"",
			"Instructions:",
			"- Stop substantive new work on this goal.",
			"- Summarize the progress made so far.",
			"- List any remaining work that could not be completed.",
			"- Do NOT call update_goal unless the goal is actually complete.",
			"",
			"The user may choose to resume with an increased budget or clear the goal.",
		].join("\n");

		this.pi.sendUserMessage(steeringMessage);
	}

	/**
	 * Inject objective updated steering when user changes objective
	 */
	injectObjectiveUpdatedSteering(oldObjective: string, newObjective: string, ctx: any): void {
		const steeringMessage = [
			"OBJECTIVE UPDATED: The user has changed the goal objective.",
			"",
			`Previous objective: ${oldObjective}`,
			"",
			`New objective: ${newObjective}`,
			"",
			"Instructions:",
			"- Pursue the NEW objective rather than continuing with stale work.",
			"- Review what you've done so far and determine what's still relevant.",
			"- Abandon work that no longer serves the new objective.",
			"- Replan if necessary to align with the new objective.",
		].join("\n");

		this.pi.sendUserMessage(steeringMessage);
	}
}