/**
 * Goal Tools
 *
 * Implements the LLM-facing goal tools: get_goal, create_goal, update_goal
 */

import type { GoalManager, Goal, GoalStatus } from "./goal-manager.js";

export class GoalTools {
	constructor(private goalManager: GoalManager) {}

	/**
	 * get_goal tool implementation
	 */
	async getGoal(
		_toolCallId: string,
		_params: unknown,
		_signal: AbortSignal | undefined,
		_onUpdate: ((update: any) => void) | undefined,
		ctx: any,
	): Promise<any> {
		const goal = this.goalManager.getGoal();

		if (!goal) {
			return {
				content: [
					{
						type: "text",
						text: "No goal is currently set for this session. Use create_goal to set one, or the /goal command.",
					},
				],
				details: { exists: false },
			};
		}

		const stats = this.goalManager.getStats();
		const goalInfo = this.formatGoalInfo(goal, stats);

		return {
			content: [
				{
					type: "text",
					text: goalInfo,
				},
			],
			details: {
				exists: true,
				goal: goal,
				stats: stats,
			},
		};
	}

	/**
	 * create_goal tool implementation
	 */
	async createGoal(
		_toolCallId: string,
		params: { objective: string; token_budget?: number },
		_signal: AbortSignal | undefined,
		_onUpdate: ((update: any) => void) | undefined,
		ctx: any,
	): Promise<any> {
		// Validate parameters
		if (!params.objective || typeof params.objective !== "string") {
			throw new Error("objective parameter is required and must be a string");
		}

		const objective = params.objective.trim();
		if (!objective) {
			throw new Error("objective cannot be empty");
		}

		if (objective.length > 4000) {
			throw new Error(
				"objective exceeds maximum length of 4000 characters. Put detailed instructions in a file and reference it from the goal.",
			);
		}

		if (params.token_budget !== undefined) {
			if (typeof params.token_budget !== "number" || params.token_budget <= 0) {
				throw new Error("token_budget must be a positive number");
			}
		}

		// Create the goal
		const goal = this.goalManager.createGoal(objective, params.token_budget);

		// Persist to session
		await this.goalManager.persistToSession(ctx.pi);

		const stats = this.goalManager.getStats();
		const goalInfo = this.formatGoalInfo(goal, stats);

		return {
			content: [
				{
					type: "text",
					text: `Goal created successfully:\n\n${goalInfo}`,
				},
			],
			details: {
				created: true,
				goal: goal,
				stats: stats,
			},
		};
	}

	/**
	 * update_goal tool implementation
	 */
	async updateGoal(
		_toolCallId: string,
		params: { status: GoalStatus; reason?: string },
		_signal: AbortSignal | undefined,
		_onUpdate: ((update: any) => void) | undefined,
		ctx: any,
	): Promise<any> {
		// Validate parameters
		if (!params.status || typeof params.status !== "string") {
			throw new Error("status parameter is required and must be a string");
		}

		const validStatuses = ["complete", "blocked"];
		if (!validStatuses.includes(params.status)) {
			throw new Error(
				`status must be one of: ${validStatuses.join(", ")}. Other status changes (pause, resume) are user-controlled via the /goal command.`,
			);
		}

		const goal = this.goalManager.getGoal();
		if (!goal) {
			throw new Error("No goal exists to update. Use create_goal to set one first.");
		}

		const previousStatus = goal.status;

		// Update the goal status
		this.goalManager.updateGoalStatus(params.status);

		// Persist to session
		await this.goalManager.persistToSession(ctx.pi);

		// Build response message
		let message = `Goal status updated: ${previousStatus.toUpperCase()} → ${params.status.toUpperCase()}`;

		if (params.reason) {
			message += `\n\nReason: ${params.reason}`;
		}

		if (params.status === "complete") {
			const stats = this.goalManager.getStats();
			if (stats) {
				message += `\n\nFinal statistics:`;
				message += `\n  Tokens used: ${stats.tokensUsed}`;
				message += `\n  Time: ${Math.round(stats.timeUsedSeconds)}s`;
				if (stats.budgetRemaining !== undefined) {
					message += `\n  Budget remaining: ${stats.budgetRemaining} tokens`;
				}
			}
		}

		return {
			content: [
				{
					type: "text",
					text: message,
				},
			],
			details: {
				updated: true,
				previousStatus,
				newStatus: params.status,
				reason: params.reason,
				goal: this.goalManager.getGoal(),
				stats: this.goalManager.getStats(),
			},
		};
	}

	/**
	 * Format goal information for display
	 */
	private formatGoalInfo(goal: Goal, stats: any): string {
		const lines = [
			`Status: ${goal.status.toUpperCase()}`,
			`Objective: ${goal.objective}`,
		];

		if (goal.tokenBudget) {
			const percent = stats?.tokensUsed
				? Math.round((stats.tokensUsed / goal.tokenBudget) * 100)
				: 0;
			lines.push(
				`Token Budget: ${stats?.tokensUsed || 0} / ${goal.tokenBudget} (${percent}%)`,
			);
		}

		if (stats?.timeUsedSeconds) {
			const timeMinutes = Math.round(stats.timeUsedSeconds / 60);
			lines.push(`Time: ${timeMinutes}m`);
		}

		const createdAt = new Date(goal.createdAt);
		lines.push(`Created: ${createdAt.toLocaleString()}`);

		return lines.join("\n");
	}
}