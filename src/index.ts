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
import { GoalChainManager } from "./goal-chain.js";

export default function (pi: ExtensionAPI) {
	const goalManager = new GoalManager();
	const goalTools = new GoalTools(goalManager);
	const goalContinuation = new GoalContinuation(goalManager, pi);

	// Initialize goal manager and goal chain manager on session start
	const goalChainManager = new GoalChainManager();

	pi.on("session_start", async (event, ctx) => {
		await goalManager.loadFromSession(ctx.sessionManager);

		// Check if there's an active goal that should continue
		if (event.reason !== "startup") {
			const goal = goalManager.getGoal();
			if (goal?.status === "active") {
				ctx.ui.notify(`Active goal: ${goal.objective.slice(0, 50)}...`, "info");
			}

			// Notify about active goal chains
			const chains = goalChainManager.getAllGoalChains();
			const activeChains = chains.filter((c) => c.status === "active");
			if (activeChains.length > 0) {
				ctx.ui.notify(`${activeChains.length} active goal chain(s)`, "info");
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

	// Register /goalchain command
	pi.registerCommand("goalchain", {
		description: "Create and manage evolutionary goal chains with reproductive clauses and sub-goals",
		handler: async (args, ctx) => {
			await handleGoalChainCommand(args, goalChainManager, pi, ctx);
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

	// Register goal chain tools for the LLM
	pi.registerTool({
		name: "get_goal_chain",
		label: "Get Goal Chain",
		description: "Retrieve information about a goal chain, including primary goal, reproductive clause, sub-goals, and record space",
		promptSnippet: "Get goal chain information including primary goal, reproductive clause, and sub-goals",
		promptGuidelines: [
			"Use get_goal_chain to inspect the evolutionary goal chain structure",
			"Review the reproductive clause to understand the primary goal and principles",
			"Check sub-goal statuses and progress",
			"Examine record space for learnings and patterns",
		],
		parameters: Type.Object({
			chain_id: Type.Optional(
				Type.String({
					description: "Optional chain ID. If not provided, returns the most recent active chain.",
				}),
			),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const chainId = params.chain_id;
			let chain: ReturnType<GoalChainManager["getGoalChain"]>;

			if (chainId) {
				chain = goalChainManager.getGoalChain(chainId);
			} else {
				// Get most recent active chain
				const chains = goalChainManager.getAllGoalChains();
				const activeChains = chains.filter((c) => c.status === "active");
				chain = activeChains.length > 0 ? activeChains[activeChains.length - 1] : null;
			}

			if (!chain) {
				return {
					content: [
						{
							type: "text",
							text: "No goal chain found. Use /goalchain create to start a new chain, or use create_goal_chain tool.",
						},
					],
					details: { exists: false },
				};
			}

			const formatted = goalChainManager.formatGoalChain(chain);
			const stats = goalChainManager.getChainStatistics(chain);

			return {
				content: [
					{
						type: "text",
						text: `${formatted}\n\nSTATISTICS:\n${JSON.stringify(stats, null, 2)}`,
					},
				],
				details: { exists: true, chain, stats },
			};
		},
	});

	pi.registerTool({
		name: "create_goal_chain",
		label: "Create Goal Chain",
		description: "Create a new evolutionary goal chain with a primary goal, reproductive clause, and optional initial sub-goals",
		promptSnippet: "Create an evolutionary goal chain with primary goal and reproductive clause",
		promptGuidelines: [
			"Use create_goal_chain when the user wants to work on a complex, multi-stage objective",
			"The reproductive clause ensures the primary goal evolves conservatively across generations",
			"Provide initial sub-goals to decompose the primary goal into manageable steps",
			"Essential principles guide the evolutionary process and maintain alignment",
		],
		parameters: Type.Object({
			primary_goal: Type.String({
				description: "The primary objective that the entire goal chain serves",
			}),
			es_sential_principles: Type.Optional(
				Type.Array(
					Type.String({
						description: "Core principles that guide the evolutionary process",
					}),
				),
			),
			initial_sub_goals: Type.Optional(
				Type.Array(
					Type.String({
						description: "Initial sub-goals to decompose the primary objective",
					}),
				),
			),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			if (!params.primary_goal || typeof params.primary_goal !== "string") {
				throw new Error("primary_goal parameter is required and must be a string");
			}

			const chain = goalChainManager.createGoalChain(
				params.primary_goal,
				params.essential_principles,
				params.initial_sub_goals,
			);

			const formatted = goalChainManager.formatGoalChain(chain);

			return {
				content: [
					{
						type: "text",
						text: `Goal chain created:\n\n${formatted}`,
					},
				],
				details: { created: true, chain },
			};
		},
	});

	pi.registerTool({
		name: "add_sub_goals",
		label: "Add Sub-Goals",
		description: "Add new sub-goals to an existing goal chain",
		promptSnippet: "Add sub-goals to decompose the primary goal further",
		promptGuidelines: [
			"Use add_sub_goals to break down the primary goal into more specific tasks",
			"Sub-goals should be actionable and measurable",
			"Each sub-goal serves the primary goal defined in the reproductive clause",
		],
		parameters: Type.Object({
			chain_id: Type.String({
				description: "The ID of the goal chain to add sub-goals to",
			}),
			objectives: Type.Array(
				Type.String({
					description: "The sub-goal objectives to add",
				}),
			),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			if (!params.chain_id || !Array.isArray(params.objectives)) {
				throw new Error("chain_id and objectives parameters are required");
			}

			const newSubGoals = goalChainManager.addSubGoals(params.chain_id, params.objectives);

			return {
				content: [
					{
						type: "text",
						text: `Added ${newSubGoals.length} sub-goals to chain ${params.chain_id}:\n${newSubGoals.map((sg) => `  - [${sg.status.toUpperCase()}] ${sg.objective}`).join("\n")}`,
					},
				],
				details: { added: true, subGoals: newSubGoals },
			};
		},
	});

	pi.registerTool({
		name: "update_sub_goal_status",
		label: "Update Sub-Goal Status",
		description: "Update the status of a sub-goal, optionally with learnings that inform chain evolution",
		promptSnippet: "Update sub-goal status to active, complete, or blocked",
		promptGuidelines: [
			"Use update_sub_goal_status when completing or blocking a sub-goal",
			"Provide learnings to help the reproductive clause evolve intelligently",
			"Learnings improve future sub-goals and primary goal mutations",
			"Complete sub-goals may trigger chain evolution based on accumulated learnings",
		],
		parameters: Type.Object({
			chain_id: Type.String({
				description: "The ID of the goal chain",
			}),
			sub_goal_id: Type.String({
				description: "The ID of the sub-goal to update",
			}),
			status: StringEnum(["active", "complete", "blocked"] as const, {
				description: "New status for the sub-goal",
			}),
			learnings: Type.Optional(
				Type.Array(
					Type.String({
						description: "Learnings from this sub-goal that inform chain evolution",
					}),
				),
			),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			if (!params.chain_id || !params.sub_goal_id || !params.status) {
				throw new Error("chain_id, sub_goal_id, and status parameters are required");
			}

			const updatedSubGoal = goalChainManager.updateSubGoalStatus(
				params.chain_id,
				params.sub_goal_id,
				params.status,
				params.learnings,
			);

			let message = `Sub-goal ${params.sub_goal_id} updated to ${params.status.toUpperCase()}`;
			if (params.learnings && params.learnings.length > 0) {
				message += `\n\nLearnings recorded:\n${params.learnings.map((l) => `  - ${l}`).join("\n")}`;
			}

			return {
				content: [
					{
						type: "text",
						text: message,
					},
				],
				details: { updated: true, subGoal: updatedSubGoal },
			};
		},
	});

	pi.registerTool({
		name: "mutate_reproductive_clause",
		label: "Mutate Reproductive Clause",
		description: "Conservatively mutate the reproductive clause based on accumulated learnings. This is the evolutionary mechanism for goal chains.",
		promptSnippet: "Mutate the reproductive clause to evolve the primary goal and principles",
		promptGuidelines: [
			"Use mutate_reproductive_clause when sufficient learnings have been accumulated",
			"Mutations should be conservative and incremental, preserving what works",
			"The reproductive clause is the lifeline - mutate thoughtfully",
			"Provide clear reasoning for the mutation with high confidence",
		],
		parameters: Type.Object({
			chain_id: Type.String({
				description: "The ID of the goal chain",
			}),
			new_primary_goal: Type.Optional(
				Type.String({
					description: "Optional refined primary goal. If not provided, current goal is preserved.",
				}),
			),
			new_principles: Type.Optional(
				Type.Array(
					Type.String({
						description: "Optional refined essential principles",
					}),
				),
			),
			mutation_reason: Type.String({
				description: "Clear explanation of why this mutation is justified based on learnings",
			}),
			confidence: Type.Optional(
				Type.Number({
					description: "Confidence in this mutation (0.0 to 1.0), default 0.7",
					minimum: 0,
					maximum: 1,
				}),
			),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			if (!params.chain_id || !params.mutation_reason) {
				throw new Error("chain_id and mutation_reason parameters are required");
			}

			const mutation = goalChainManager.mutateReproductiveClause(
				params.chain_id,
				params.new_primary_goal,
				params.new_principles,
				params.mutation_reason,
				params.confidence || 0.7,
			);

			const message = [
				`Reproductive clause mutated to version ${mutation.newClause.version}`,
				`",
				`Reason: ${mutation.mutation_reason}`,
				`Confidence: ${Math.round(mutation.confidence * 100)}%`,
				`",
				`Primary goal: ${mutation.newClause.primaryGoal}`,
				`",
				`New principles:`,
				...mutation.newClause.essentialPrinciples.map((p) => `  - ${p}`),
			].join("\n");

			return {
				content: [
					{
						type: "text",
						text: message,
					},
				],
				details: { mutated: true, mutation },
			};
		},
	});

	pi.registerTool({
		name: "infer_sub_goals",
		label: "Infer Sub-Goals",
		description: "Infer additional sub-goals from the record space and blocked goals. This leverages the evolutionary history to suggest new approaches.",
		promptSnippet: "Infer sub-goals from record space patterns and blocked goals",
		promptGuidelines: [
			"Use infer_sub_goals when stuck or when the primary goal needs further decomposition",
			"Inference leverages the record space - the accumulated history of the chain",
			"Inferred goals suggest alternative approaches to blocked sub-goals",
			"The reproductive clause ensures inferred goals remain aligned with primary objectives",
		],
		parameters: Type.Object({
			chain_id: Type.String({
				description: "The ID of the goal chain",
			}),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			if (!params.chain_id) {
				throw new Error("chain_id parameter is required");
			}

			const inferredGoals = goalChainManager.inferSubGoals(params.chain_id);

			if (inferredGoals.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: "No new sub-goals could be inferred from the record space. Continue with existing sub-goals or add new ones manually.",
						},
					],
					details: { inferred: 0, subGoals: [] },
				};
			}

			return {
				content: [
					{
						type: "text",
						text: `Inferred ${inferredGoals.length} sub-goals from record space:\n${inferredGoals.map((sg) => `  - [${sg.status.toUpperCase()}] ${sg.objective}`).join("\n")}`,
					},
				],
				details: { inferred: inferredGoals.length, subGoals: inferredGoals },
			};
		},
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
 * Handle /goalchain command variations
 */
async function handleGoalChainCommand(
	args: string,
	goalChainManager: GoalChainManager,
	pi: ExtensionAPI,
	ctx: any,
): Promise<void> {
	const trimmed = args.trim();

	if (!trimmed) {
		// Show chains or usage
		const chains = goalChainManager.getAllGoalChains();
		if (chains.length === 0) {
			ctx.ui.notify(
				"No goal chains. Usage: /goalchain create <primary_goal> | list | show <id> | mutate <id> | delete <id>",
				"info",
			);
			return;
		}

		// Show all chains
		const chainSummary = chains
			.map(
				(c) =>
					`[${c.status.toUpperCase()}] ${c.id}: ${c.primaryGoal.slice(0, 60)}... (gen ${c.currentGeneration}, ${c.subGoals.length} sub-goals)`,
			)
			.join("\n");
		ctx.ui.notify(`Goal Chains:\n${chainSummary}`, "info");
		return;
	}

	const parts = trimmed.split(/\s+/);
	const command = parts[0].toLowerCase();
	const remaining = parts.slice(1).join(" ");

	switch (command) {
		case "create": {
			if (!remaining) {
				ctx.ui.notify("Usage: /goalchain create <primary_goal>", "error");
				return;
			}
			const chain = goalChainManager.createGoalChain(remaining);
			const formatted = goalChainManager.formatGoalChain(chain);
			ctx.ui.notify(`Goal chain created:\n${formatted}`, "info");
			break;
		}

		case "list": {
			const chains = goalChainManager.getAllGoalChains();
			if (chains.length === 0) {
				ctx.ui.notify("No goal chains", "info");
				return;
			}
			const chainSummary = chains
				.map(
					(c) =>
						`[${c.status.toUpperCase()}] ${c.id}: ${c.primaryGoal.slice(0, 60)}... (gen ${c.currentGeneration}, ${c.subGoals.length} sub-goals)`,
				)
				.join("\n");
			ctx.ui.notify(`Goal Chains:\n${chainSummary}`, "info");
			break;
		}

		case "show":
		case "view": {
			const chainId = remaining || parts[1];
			if (!chainId) {
				ctx.ui.notify("Usage: /goalchain show <chain_id>", "error");
				return;
			}
			const chain = goalChainManager.getGoalChain(chainId);
			if (!chain) {
				ctx.ui.notify(`Goal chain ${chainId} not found`, "error");
				return;
			}
			const formatted = goalChainManager.formatGoalChain(chain);
			const stats = goalChainManager.getChainStatistics(chain);
			ctx.ui.notify(
				`${formatted}\n\nSTATISTICS:\n${JSON.stringify(stats, null, 2)}`,
				"info",
			);
			break;
		}

		case "delete": {
			const chainId = remaining || parts[1];
			if (!chainId) {
				ctx.ui.notify("Usage: /goalchain delete <chain_id>", "error");
				return;
			}
			const confirmed = await ctx.ui.confirm(
				"Delete goal chain?",
				`Are you sure you want to delete goal chain ${chainId}? This cannot be undone.`,
			);
			if (!confirmed) {
				ctx.ui.notify("Deletion cancelled", "info");
				return;
			}
			const deleted = goalChainManager.deleteGoalChain(chainId);
			if (deleted) {
				ctx.ui.notify(`Goal chain ${chainId} deleted`, "info");
			} else {
				ctx.ui.notify(`Goal chain ${chainId} not found`, "error");
			}
			break;
		}

		case "mutate": {
			ctx.ui.notify(
				"Mutation should be done via LLM using the mutate_reproductive_clause tool based on accumulated learnings.",
				"info",
			);
			ctx.ui.notify(
				"Use: 'Mutate the reproductive clause for goal chain <id> based on learnings from completed sub-goals'",
				"info",
			);
			break;
		}

		case "infer": {
			const chainId = remaining || parts[1];
			if (!chainId) {
				ctx.ui.notify("Usage: /goalchain infer <chain_id>", "error");
				return;
			}
			const inferredGoals = goalChainManager.inferSubGoals(chainId);
			if (inferredGoals.length === 0) {
				ctx.ui.notify("No new sub-goals could be inferred", "info");
			} else {
				ctx.ui.notify(
					`Inferred ${inferredGoals.length} sub-goals:\n${inferredGoals.map((sg) => `  - [${sg.status.toUpperCase()}] ${sg.objective}`).join("\n")}`,
					"info",
				);
			}
			break;
		}

		default:
			ctx.ui.notify(
				"Usage: /goalchain create <primary_goal> | list | show <id> | mutate <id> | delete <id> | infer <id>",
				"info",
			);
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