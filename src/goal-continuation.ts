/**
 * Goal Continuation
 *
 * Manages automatic continuation when a goal is active and the session is idle.
 * Inspired by Codex's continuation steering and automatic turn initiation.
 */

import type { Goal, GoalManager } from "./goal-manager.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type ContinuationStrategy = "initial" | "steady" | "budget_conservative" | "context_handoff";

export interface ContinuationPlan {
	strategy: ContinuationStrategy;
	intervalMs: number;
	contextPercent?: number;
	budgetPercentUsed?: number;
	continuationCount: number;
	guidance: string[];
}

export class GoalContinuation {
	private continuationEnabled = false;
	private continuationInProgress = false;
	private lastContinuationTime = 0;
	private continuationCount = 0;
	private readonly BASE_CONTINUATION_INTERVAL_MS = 2000; // 2 seconds between steady continuations
	private readonly MIN_CONTINUATION_INTERVAL_MS = 1000;
	private readonly MAX_CONTINUATION_INTERVAL_MS = 15000;

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
	 * Return the current adaptive continuation plan without triggering a turn.
	 */
	getContinuationPlan(ctx?: any): ContinuationPlan | null {
		const goal = this.goalManager.getGoal();
		if (!goal || goal.status !== "active") {
			return null;
		}
		return this.buildContinuationPlan(goal, ctx);
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

		const plan = this.buildContinuationPlan(goal, ctx);
		const now = Date.now();
		if (now - this.lastContinuationTime < plan.intervalMs) {
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
			const plan = this.buildContinuationPlan(goal, ctx);
			const steeringMessage = this.buildContinuationMessage(goal, plan);
			this.pi.sendUserMessage(steeringMessage);
			this.continuationCount += 1;
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
	private buildContinuationMessage(goal: Goal, plan: ContinuationPlan): string {
		const lines = [
			"CONTINUATION: You are continuing work on the active goal.",
			"",
			"Current Goal:",
			goal.objective,
			"",
			"Continuation Strategy:",
			`- Strategy: ${plan.strategy}`,
			`- Adaptive cadence: wait at least ${Math.round(plan.intervalMs / 1000)}s before another automatic continuation`,
			...plan.guidance.map((item) => `- ${item}`),
			"",
			"Instructions:",
			"- Continue working toward the goal objective.",
			"- Preserve the full context and progress made so far.",
			"- Work from evidence and files you've already examined.",
			"- Keep your plan current as you discover new information.",
			"- Prefer the next smallest verifiable increment over broad exploration.",
			"- Only call update_goal with status 'complete' when the goal is truly finished.",
			"- Only call update_goal with status 'blocked' if you cannot proceed despite trying multiple approaches.",
		];

		const stats = this.goalManager.getStats();
		if (goal.tokenBudget) {
			const remaining = stats?.budgetRemaining ?? goal.tokenBudget - (stats?.tokensUsed ?? 0);
			const remainingPercent = Math.max(0, Math.round((remaining / goal.tokenBudget) * 100));

			lines.push("");
			lines.push("Token Budget:");
			lines.push(`- Used: ${stats?.tokensUsed ?? 0}/${goal.tokenBudget} tokens`);
			lines.push(`- Remaining: ${remaining} tokens (${remainingPercent}% of budget)`);
			lines.push("- Be mindful of token usage and prioritize efficiently.");
		}

		if (plan.contextPercent !== undefined) {
			lines.push("");
			lines.push("Context Usage:");
			lines.push(`- Current context: ${Math.round(plan.contextPercent)}% full`);
			if (plan.contextPercent >= 80) {
				lines.push("- Consider /goal handoff if continuing would risk losing important context.");
			}
		}

		return lines.join("\n");
	}

	private buildContinuationPlan(goal: Goal, ctx?: any): ContinuationPlan {
		const stats = this.goalManager.getStats();
		const contextPercent = this.getContextPercent(ctx);
		const budgetPercentUsed = goal.tokenBudget
			? Math.min(100, Math.max(0, ((stats?.tokensUsed ?? 0) / goal.tokenBudget) * 100))
			: undefined;

		let strategy: ContinuationStrategy = this.continuationCount === 0 ? "initial" : "steady";
		let intervalMs = this.continuationCount === 0
			? this.MIN_CONTINUATION_INTERVAL_MS
			: this.BASE_CONTINUATION_INTERVAL_MS;
		const guidance: string[] = [];

		if (strategy === "initial") {
			guidance.push("Start by identifying the next concrete action and any files or tests needed for evidence.");
		} else {
			guidance.push("Continue from the previous turn's evidence and avoid restarting already-completed investigation.");
		}

		if (budgetPercentUsed !== undefined) {
			if (budgetPercentUsed >= 80) {
				strategy = "budget_conservative";
				intervalMs = Math.max(intervalMs, 10000);
				guidance.push("Token budget is tight; prioritize completion-critical validation and concise reporting.");
			} else if (budgetPercentUsed >= 50) {
				intervalMs = Math.max(intervalMs, 5000);
				guidance.push("Budget is partly consumed; avoid speculative work and keep changes incremental.");
			}
		}

		if (contextPercent !== undefined) {
			if (contextPercent >= 90) {
				strategy = "context_handoff";
				intervalMs = Math.max(intervalMs, this.MAX_CONTINUATION_INTERVAL_MS);
				guidance.push("Context is nearly full; prepare a compact handoff or finish the smallest safe unit of work.");
			} else if (contextPercent >= 75) {
				intervalMs = Math.max(intervalMs, 8000);
				guidance.push("Context is high; summarize decisions and avoid pulling in unrelated history.");
			}
		}

		return {
			strategy,
			intervalMs: this.clampInterval(intervalMs),
			contextPercent,
			budgetPercentUsed,
			continuationCount: this.continuationCount,
			guidance,
		};
	}

	private clampInterval(intervalMs: number): number {
		return Math.min(this.MAX_CONTINUATION_INTERVAL_MS, Math.max(this.MIN_CONTINUATION_INTERVAL_MS, intervalMs));
	}

	private getContextPercent(ctx?: any): number | undefined {
		const usage = ctx?.getContextUsage?.();
		if (!usage || usage.percent === null || usage.percent === undefined) {
			return undefined;
		}
		const percent = usage.percent <= 1 ? usage.percent * 100 : usage.percent;
		return Number.isFinite(percent) ? percent : undefined;
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

}