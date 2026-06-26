/**
 * Goal Chain Continuation
 *
 * Automatic continuation logic for active goal chains. Extracted from
 * index.ts so the chain-continuation path is importable and unit-testable.
 *
 * The continuation is delivered with `{ deliverAs: "followUp" }` because Pi's
 * `isStreaming` is still `true` during `turn_end` handling — a bare
 * `sendUserMessage` would throw and be swallowed, halting continuation. See
 * docs/continuation-halt-postmortem.md.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { GoalChainManager } from "./goal-chain.js";

export interface GoalChainContinuationState {
	isInProgress: () => boolean;
	setInProgress: (value: boolean) => void;
	getLastTime: () => number;
	setLastTime: (value: number) => void;
	minInterval: number;
}

export interface GoalChainContinuationOptions {
	allowWithoutActionableSubGoals?: boolean;
	preferredChainId?: string;
}

/**
 * Build a one-shot continuation state (no shared interval/in-progress flags).
 * Used by `/goalchain` commands that want to kick the agent exactly once.
 */
export function createOneShotGoalChainContinuationState(): GoalChainContinuationState {
	let inProgress = false;
	let lastTime = 0;
	return {
		isInProgress: () => inProgress,
		setInProgress: (value: boolean) => {
			inProgress = value;
		},
		getLastTime: () => lastTime,
		setLastTime: (value: number) => {
			lastTime = value;
		},
		minInterval: 0,
	};
}

/**
 * Check whether a continuation turn should be triggered for an active goal chain
 * and, if so, deliver a steering message to the agent.
 *
 * Continuation is delivered as `followUp` so it survives the `turn_end`
 * streaming window (see module header). When `allowWithoutActionableSubGoals`
 * is set, the continuation fires even when no sub-goals are queued — used by
 * the `turn_end` auto path so continuous development never self-terminates
 * while a chain is active.
 */
export async function checkGoalChainContinuation(
	goalChainManager: GoalChainManager,
	pi: ExtensionAPI,
	ctx: any,
	state: GoalChainContinuationState,
	options: GoalChainContinuationOptions = {},
): Promise<void> {
	if (state.isInProgress()) {
		return;
	}

	const now = Date.now();
	if (now - state.getLastTime() < state.minInterval) {
		return;
	}

	if (ctx?.isIdle && !ctx.isIdle()) {
		return;
	}

	const activeChains = goalChainManager.getAllGoalChains().filter((chain) => chain.status === "active");
	if (activeChains.length === 0) {
		return;
	}

	const chain =
		(options.preferredChainId && activeChains.find((activeChain) => activeChain.id === options.preferredChainId)) ||
		activeChains[activeChains.length - 1];
	const actionableSubGoals = chain.subGoals.filter((subGoal) =>
		["pending", "active"].includes(subGoal.status),
	);
	if (actionableSubGoals.length === 0 && !options.allowWithoutActionableSubGoals) {
		// No work is queued. Avoid repeatedly waking the agent just to say there is
		// nothing to do; explicit /goalchain continue can still kick the agent.
		return;
	}

	state.setInProgress(true);
	state.setLastTime(now);
	try {
		const nextSubGoal =
			actionableSubGoals.find((subGoal) => subGoal.status === "active") || actionableSubGoals[0];
		const message = [
			"CONTINUATION: You are continuing work on the active goal chain.",
			"",
			`Goal Chain: ${chain.id}`,
			`Primary Goal: ${chain.primaryGoal}`,
			`Generation: ${chain.currentGeneration} / ${chain.totalGenerations}`,
			"",
			"Instructions:",
			"- Continue working toward the primary goal and reproductive clause.",
			"- Use get_goal_chain to inspect current state before making decisions.",
			"- If there are pending sub-goals, activate and work the next useful one.",
			"- Record learnings when completing or blocking sub-goals.",
			"- Do not mark work complete unless the goal chain objective is truly satisfied.",
		];

		if (nextSubGoal) {
			message.push("", `Next sub-goal candidate: [${nextSubGoal.status.toUpperCase()}] ${nextSubGoal.id} - ${nextSubGoal.objective}`);
		} else {
			message.push(
				"",
				"No pending or active sub-goals are currently queued.",
				"Action: add or infer the next sub-goal toward the primary goal.",
				"If additional sub-goals are no longer making a meaningful difference, recognize diminishing returns and evolve at a more basic level: call mutate_reproductive_clause to start a new generation, then queue sub-goals for it.",
				"Continuous development never ceases while the chain is active; only the user pauses it. Do not declare the chain done.",
			);
		}

		// deliverAs: followUp bridges into pi's agent loop: during turn_end handling,
		// isStreaming is still true, so sendUserMessage without a streaming behavior
		// would throw and be swallowed (the continuation never fires). followUp queues
		// the message, which the loop drains via getFollowUpMessages before agent_end.
		pi.sendUserMessage(message.join("\n"), { deliverAs: "followUp" });
	} catch (error) {
		console.error("Failed to trigger goal chain continuation:", error);
	} finally {
		state.setInProgress(false);
	}
}
