/**
 * Goal Manager
 *
 * Manages the lifecycle and persistence of goals within a session.
 * Goals are thread-scoped and persisted through the session manager.
 */

import type { SessionManager } from "@earendil-works/pi-coding-agent";

export type GoalStatus = "active" | "paused" | "blocked" | "complete" | "budget_limited";

export interface Goal {
	id: string;
	objective: string;
	status: GoalStatus;
	tokenBudget?: number;
	tokensUsed: number;
	timeUsedSeconds: number;
	createdAt: number;
	updatedAt: number;
}

const MAX_OBJECTIVE_CHARS = 4000;
const TERMINAL_STATUSES: GoalStatus[] = ["complete", "blocked", "budget_limited"];

/**
 * GoalManager handles all goal state operations
 */
export class GoalManager {
	private goal: Goal | null = null;
	private nextGoalId = 1;

	/**
	 * Create a new goal
	 */
	createGoal(objective: string, tokenBudget?: number): Goal {
		// Validate objective
		const trimmedObjective = objective.trim();
		if (!trimmedObjective) {
			throw new Error("Goal objective cannot be empty");
		}
		if (trimmedObjective.length > MAX_OBJECTIVE_CHARS) {
			throw new Error(
				`Goal objective exceeds maximum length of ${MAX_OBJECTIVE_CHARS} characters`,
			);
		}

		// Check for existing incomplete goal
		if (this.goal && !this.isTerminal(this.goal.status)) {
			throw new Error(
				"An unfinished goal already exists. Use update_goal to change status, or clear the goal first.",
			);
		}

		const now = Date.now();
		this.goal = {
			id: `goal-${this.nextGoalId++}`,
			objective: trimmedObjective,
			status: "active",
			tokenBudget,
			tokensUsed: 0,
			timeUsedSeconds: 0,
			createdAt: now,
			updatedAt: now,
		};

		return this.goal;
	}

	/**
	 * Get the current goal
	 */
	getGoal(): Goal | null {
		return this.goal;
	}

	/**
	 * Update goal status
	 */
	updateGoalStatus(status: GoalStatus): Goal | null {
		if (!this.goal) {
			throw new Error("No goal exists to update");
		}

		// Validate status transition
		if (!this.isValidTransition(this.goal.status, status)) {
			throw new Error(
				`Invalid status transition from ${this.goal.status} to ${status}`,
			);
		}

		this.goal.status = status;
		this.goal.updatedAt = Date.now();

		return this.goal;
	}

	/**
	 * Update goal objective
	 */
	updateObjective(objective: string): Goal | null {
		if (!this.goal) {
			throw new Error("No goal exists to update");
		}

		const trimmedObjective = objective.trim();
		if (!trimmedObjective) {
			throw new Error("Goal objective cannot be empty");
		}
		if (trimmedObjective.length > MAX_OBJECTIVE_CHARS) {
			throw new Error(
				`Goal objective exceeds maximum length of ${MAX_OBJECTIVE_CHARS} characters`,
			);
		}

		this.goal.objective = trimmedObjective;
		this.goal.updatedAt = Date.now();

		return this.goal;
	}

	/**
	 * Update token budget
	 */
	updateTokenBudget(tokenBudget: number): Goal | null {
		if (!this.goal) {
			throw new Error("No goal exists to update");
		}

		if (tokenBudget <= 0) {
			throw new Error("Token budget must be positive");
		}

		this.goal.tokenBudget = tokenBudget;
		this.goal.updatedAt = Date.now();

		// Check if already over budget
		if (this.goal.tokensUsed >= tokenBudget) {
			this.goal.status = "budget_limited";
		}

		return this.goal;
	}

	/**
	 * Clear the current goal
	 */
	clearGoal(): void {
		this.goal = null;
	}

	/**
	 * Account token usage
	 */
	accountUsage(tokens: number): void {
		if (!this.goal || this.goal.status !== "active") {
			return;
		}

		this.goal.tokensUsed += tokens;
		this.goal.updatedAt = Date.now();

		// Check budget limit
		if (this.goal.tokenBudget && this.goal.tokensUsed >= this.goal.tokenBudget) {
			this.goal.status = "budget_limited";
		}
	}

	/**
	 * Check if goal is in a terminal state
	 */
	isTerminal(status: GoalStatus): boolean {
		return TERMINAL_STATUSES.includes(status);
	}

	/**
	 * Validate status transition
	 */
	private isValidTransition(from: GoalStatus, to: GoalStatus): boolean {
		// Allow same status
		if (from === to) return true;

		// From active: can go to paused, blocked, complete, budget_limited
		if (from === "active") {
			return ["paused", "blocked", "complete", "budget_limited"].includes(to);
		}

		// From paused: can go to active
		if (from === "paused") {
			return to === "active";
		}

		// From blocked: can go to active (user override)
		if (from === "blocked") {
			return to === "active";
		}

		// From budget_limited: can go to active (user override) or complete
		if (from === "budget_limited") {
			return to === "active" || to === "complete";
		}

		// Terminal statuses cannot transition
		return false;
	}

	/**
	 * Load goal state from session
	 */
	async loadFromSession(sessionManager: SessionManager): Promise<void> {
		this.goal = null;
		this.nextGoalId = 1;

		// Scan session-level custom entries and use the latest goal entry. Prefer
		// getEntries() for reload-safe extension persistence; fall back to getBranch()
		// for older Pi runtimes.
		const entries = typeof (sessionManager as any).getEntries === "function"
			? (sessionManager as any).getEntries()
			: sessionManager.getBranch();
		for (const entry of entries) {
			if (entry.type !== "custom" || entry.customType !== "telos:goal") {
				continue;
			}

			const goalData = entry.data as Goal | null;
			if (!goalData) {
				this.goal = null;
				continue;
			}

			this.goal = goalData;
			const parsedId = Number.parseInt(goalData.id?.split("-")[1] || "", 10);
			if (Number.isFinite(parsedId)) {
				this.nextGoalId = Math.max(this.nextGoalId, parsedId + 1);
			}
		}
	}

	/**
	 * Persist goal state to session
	 */
	async persistToSession(pi: { appendEntry?: (customType: string, data?: unknown) => void } | undefined): Promise<boolean> {
		if (typeof pi?.appendEntry !== "function") {
			return false;
		}

		pi.appendEntry("telos:goal", this.goal);
		return true;
	}

	/**
	 * Get goal statistics
	 */
	getStats(): { tokensUsed: number; timeUsedSeconds: number; budgetRemaining?: number } | null {
		if (!this.goal) {
			return null;
		}

		return {
			tokensUsed: this.goal.tokensUsed,
			timeUsedSeconds: this.goal.timeUsedSeconds,
			budgetRemaining: this.goal.tokenBudget
				? Math.max(0, this.goal.tokenBudget - this.goal.tokensUsed)
				: undefined,
		};
	}
}