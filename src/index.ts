/**
 * Telos Extension for Pi Coding Assistant
 *
 * Brings /goal functionality to Pi, inspired by Codex's persistent thread goal feature.
 *
 * Features:
 * - /goal <objective> - Set a persistent objective for the current session
 * - /goal - View the current goal and its status
 * - /goal pause - Pause the current goal
 * - /goal resume - Resume a paused goal
 * - /goal clear - Remove the current goal
 * - Goal tools for the LLM: get_goal, create_goal, update_goal
 * - Automatic continuation when a goal is active and the session is idle
 * - Token budget tracking and usage accounting
 * - Status tracking: active, paused, blocked, complete, budget_limited
 *
 * Usage:
 *   pi -e /path/to/telos
 *
 * Research based on: openai/codex at commit d2484697b1f9ce33d1d818ccad859ca3a4d721c6
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { GoalManager } from "./goal-manager.js";
import { GoalTools } from "./goal-tools.js";
import { GoalContinuation } from "./goal-continuation.js";

export default function (pi: ExtensionAPI) {
	const goalManager = new GoalManager();
	const goalTools = new GoalTools(goalManager);
	const goalContinuation = new GoalContinuation(goalManager, pi);

	// Initialize goal manager on session start
	pi.on("session_start", async (event, ctx) => {
		await goalManager.loadFromSession(ctx.sessionManager);

		// Check if there's an active goal that should continue
		if (event.reason !== "startup") {
			const goal = goalManager.getGoal();
			if (goal?.status === "active") {
				ctx.ui.notify(`Active goal: ${goal.objective.slice(0, 50)}...`, "info");
			}
		}
	});

	// Save goal state on session shutdown
	pi.on("session_shutdown", async (_event, _ctx) => {
		// Goal state is persisted through tool results and custom entries
		// No explicit shutdown needed
	});

	// Register /goal command
	pi.registerCommand("goal", {
		description: "Set, view, pause, resume, or clear a persistent goal for the session",
		handler: async (args, ctx) => {
			await handleGoalCommand(args, goalManager, goalContinuation, pi, ctx);
		},
	});

	// Register goal tools for the LLM
	pi.registerTool({
		name: "get_goal",
		label: "Get Goal",
		description: "Retrieve the current goal for this session, including its objective, status, and usage statistics",
		promptSnippet: "Get the current goal objective, status, and usage information",
		promptGuidelines: [
			"Use get_goal to check the current goal status and read the full objective when needed.",
			"Call get_goal before making decisions that depend on the goal state.",
		],
		parameters: Type.Object({}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return goalTools.getGoal(toolCallId, params, signal, onUpdate, ctx);
		},
	});

	pi.registerTool({
		name: "create_goal",
		label: "Create Goal",
		description: "Create a new goal for this session with an objective and optional token budget. Only allowed when no unfinished goal exists.",
		promptSnippet: "Create a new goal with an objective and optional token budget",
		promptGuidelines: [
			"Use create_goal only when explicitly asked by the user to set a goal.",
			"create_goal fails if an unfinished goal already exists - use update_goal instead.",
			"Objectives must be non-empty and under 4000 characters.",
			"Set a token_budget to limit total tokens used for this goal.",
		],
		parameters: Type.Object({
			objective: Type.String({
				description: "The goal objective (1-4000 characters). Must be non-empty.",
			}),
			token_budget: Type.Optional(
				Type.Number({
					description: "Optional maximum tokens to spend on this goal",
					minimum: 1,
				}),
			),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return goalTools.createGoal(toolCallId, params, signal, onUpdate, ctx);
		},
	});

	pi.registerTool({
		name: "update_goal",
		label: "Update Goal",
		description: "Update the current goal status. Only supports transitioning to 'complete' or 'blocked'.",
		promptSnippet: "Update goal status to complete or blocked",
		promptGuidelines: [
			"Use update_goal only when the goal is actually complete or cannot proceed (blocked).",
			"Only 'complete' and 'blocked' statuses are allowed - pause/resume are user-controlled via /goal command.",
			"When marking complete, provide a brief summary of what was accomplished.",
		],
		parameters: Type.Object({
			status: StringEnum(["complete", "blocked"] as const, {
				description: "New goal status: 'complete' if finished, 'blocked' if cannot proceed",
			}),
			reason: Type.Optional(
				Type.String({
					description: "Optional explanation for why the goal is blocked or summary of what was completed",
				}),
			),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return goalTools.updateGoal(toolCallId, params, signal, onUpdate, ctx);
		},
	});

	// Set up continuation tracking
	pi.on("turn_end", async (_event, ctx) => {
		await goalContinuation.checkContinuation(ctx);
	});

	// Track token usage for goals
	pi.on("message_end", async (event, ctx) => {
		if (event.message.role === "assistant" && event.message.usage) {
			const { promptTokens, completionTokens } = event.message.usage;
			const totalTokens = (promptTokens || 0) + (completionTokens || 0);
			await goalManager.accountUsage(totalTokens);
		}
	});

	// Monitor for tool completion to update goal state
	pi.on("tool_execution_end", async (event, ctx) => {
		if (event.toolName === "update_goal" && !event.isError) {
			// Goal was just updated, check if we need to stop continuation
			await goalContinuation.handleGoalUpdate(event, ctx);
		}
	});
}

/**
 * Handle /goal command variations
 */
async function handleGoalCommand(
	args: string,
	goalManager: GoalManager,
	goalContinuation: GoalContinuation,
	pi: ExtensionAPI,
	ctx: any,
): Promise<void> {
	const trimmed = args.trim();
	const goal = goalManager.getGoal();

	// No args: show current goal or usage
	if (!trimmed) {
		if (!goal) {
			ctx.ui.notify(
				"No active goal. Usage: /goal <objective> | pause | resume | clear",
				"info",
			);
			return;
		}
		showGoalStatus(goal, ctx);
		return;
	}

	// Handle subcommands
	const parts = trimmed.split(/\s+/);
	const command = parts[0].toLowerCase();
	const remaining = parts.slice(1).join(" ");

	switch (command) {
		case "clear":
			if (!goal) {
				ctx.ui.notify("No active goal to clear", "info");
				return;
			}
			goalManager.clearGoal();
			goalContinuation.disableContinuation();
			ctx.ui.notify("Goal cleared", "info");
			break;

		case "pause":
			if (!goal) {
				ctx.ui.notify("No active goal to pause", "info");
				return;
			}
			if (goal.status === "paused") {
				ctx.ui.notify("Goal is already paused", "info");
				return;
			}
			goalManager.updateGoalStatus("paused");
			goalContinuation.disableContinuation();
			ctx.ui.notify("Goal paused", "info");
			break;

		case "resume":
			if (!goal) {
				ctx.ui.notify("No active goal to resume", "info");
				return;
			}
			if (goal.status === "active") {
				ctx.ui.notify("Goal is already active", "info");
				return;
			}
			goalManager.updateGoalStatus("active");
			goalContinuation.enableContinuation();
			ctx.ui.notify("Goal resumed", "info");
			break;

		default:
			// Treat as objective
			const objective = trimmed;
			if (objective.length > 4000) {
				ctx.ui.notify(
					"Objective too long (max 4000 characters). Put detailed instructions in a file and reference it from the goal.",
					"error",
				);
				return;
			}

			if (goal && goal.status !== "complete") {
				// Confirm before replacing non-complete goal
				const confirmed = await ctx.ui.confirm(
					"Replace existing goal?",
					`Current goal: ${goal.objective.slice(0, 100)}...\n\nReplace with: ${objective.slice(0, 100)}...`,
				);
				if (!confirmed) {
					ctx.ui.notify("Goal replacement cancelled", "info");
					return;
				}
			}

			// Create the new goal
			goalManager.createGoal(objective);
			goalContinuation.enableContinuation();
			ctx.ui.notify("Goal set successfully", "info");
			break;
	}
}

/**
 * Display current goal status to the user
 */
function showGoalStatus(goal: any, ctx: any): void {
	const lines = [
		`Goal Status: ${goal.status.toUpperCase()}`,
		`Objective: ${goal.objective}`,
	];

	if (goal.tokenBudget) {
		const percent = goal.tokensUsed ? Math.round((goal.tokensUsed / goal.tokenBudget) * 100) : 0;
		lines.push(`Token Budget: ${goal.tokensUsed || 0} / ${goal.tokenBudget} (${percent}%)`);
	}

	if (goal.createdAt) {
		const date = new Date(goal.createdAt);
		lines.push(`Created: ${date.toLocaleString()}`);
	}

	ctx.ui.notify(lines.join("\n"), "info");
}