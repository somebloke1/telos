import assert from "node:assert/strict";
import test from "node:test";
import { GoalChainManager } from "../src/goal-chain.ts";
import {
	checkGoalChainContinuation,
	createOneShotGoalChainContinuationState,
} from "../src/goal-chain-continuation.ts";

/**
 * Real-path tests for the goal-chain continuation logic that was the subject
 * of the continuation halt. These exercise checkGoalChainContinuation directly
 * (now importable after the extraction) and lock the three parts of the fix:
 *
 *  1. The continuation is delivered with { deliverAs: "followUp" } so it
 *     survives Pi's turn_end streaming window (the root cause of the halt).
 *  2. The turn_end auto path passes allowWithoutActionableSubGoals so the
 *     chain never self-terminates while active (continuous development).
 *  3. The no-actionable-subgoals message steers toward evolving at a more
 *     basic level via mutate_reproductive_clause rather than "no work".
 */

function buildHarness({ subGoalObjectives = [] } = {}) {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Ship continuous development");
	if (subGoalObjectives.length > 0) {
		manager.addSubGoals(chain.id, subGoalObjectives);
	}

	const calls = [];
	// Minimal pi mock: capture every sendUserMessage (content, options) call.
	const pi = {
		sendUserMessage(message, options) {
			calls.push({ message, options });
		},
	};
	// Minimal ctx mock: idle unless overridden.
	const ctx = { isIdle: () => true };
	return { manager, chain, pi, ctx, calls };
}

test("checkGoalChainContinuation delivers the continuation as followUp (root-cause fix)", async () => {
	const { manager, chain, pi, ctx, calls } = buildHarness({
		subGoalObjectives: ["Step one", "Step two"],
	});

	await checkGoalChainContinuation(manager, pi, ctx, createOneShotGoalChainContinuationState(), {
		allowWithoutActionableSubGoals: true,
	});

	assert.equal(calls.length, 1, "a continuation should be delivered");
	assert.deepEqual(
		calls[0].options,
		{ deliverAs: "followUp" },
		"continuation must be delivered as followUp so it survives the turn_end streaming window",
	);
	assert.match(calls[0].message, /CONTINUATION: You are continuing work on the active goal chain\./);
	assert.match(calls[0].message, new RegExp(`Goal Chain: ${chain.id}`));
});

test("checkGoalChainContinuation with allowWithoutActionableSubGoals fires even when no sub-goals are queued", async () => {
	// This is the turn_end auto path: an active chain with no queued sub-goals
	// must still continue (continuous development never self-terminates).
	const { manager, pi, ctx, calls } = buildHarness();

	await checkGoalChainContinuation(manager, pi, ctx, createOneShotGoalChainContinuationState(), {
		allowWithoutActionableSubGoals: true,
	});

	assert.equal(calls.length, 1, "should still fire with no actionable sub-goals when allowed");
	assert.match(calls[0].message, /No pending or active sub-goals are currently queued\./);
	assert.match(calls[0].message, /mutate_reproductive_clause/);
	assert.match(calls[0].message, /Continuous development never ceases while the chain is active/);
});

test("checkGoalChainContinuation without allowWithoutActionableSubGoals does NOT fire when nothing is queued", async () => {
	// Manual/exploratory entry points preserve the guard: avoid repeatedly
	// waking the agent when there is genuinely nothing to do.
	const { manager, pi, ctx, calls } = buildHarness();

	await checkGoalChainContinuation(manager, pi, ctx, createOneShotGoalChainContinuationState());

	assert.equal(calls.length, 0, "should not fire when no actionable sub-goals and the flag is unset");
});

test("checkGoalChainContinuation surfaces the next active sub-goal candidate", async () => {
	const { manager, chain, pi, ctx, calls } = buildHarness({
		subGoalObjectives: ["First", "Second"],
	});
	// Activate the second sub-goal to verify the active-first selection.
	const subGoals = manager.getGoalChain(chain.id).subGoals;
	manager.updateSubGoalStatus(chain.id, subGoals[1].id, "active");

	await checkGoalChainContinuation(manager, pi, ctx, createOneShotGoalChainContinuationState(), {
		allowWithoutActionableSubGoals: true,
	});

	assert.equal(calls.length, 1);
	assert.match(calls[0].message, /Next sub-goal candidate: \[ACTIVE\]/);
	assert.match(calls[0].message, /Second/);
});

test("checkGoalChainContinuation respects the isIdle gate", async () => {
	const { manager, pi, calls } = buildHarness({ subGoalObjectives: ["Step one"] });
	const busyCtx = { isIdle: () => false };

	await checkGoalChainContinuation(manager, pi, busyCtx, createOneShotGoalChainContinuationState(), {
		allowWithoutActionableSubGoals: true,
	});

	assert.equal(calls.length, 0, "must not continue while the agent is not idle");
});

test("checkGoalChainContinuation does not fire when no active chain exists", async () => {
	const manager = new GoalChainManager();
	// No chains created at all -> no active chains.
	const pi = { sendUserMessage() { /* never called */ } };
	const ctx = { isIdle: () => true };
	const calls = [];
	pi.sendUserMessage = (m, o) => calls.push({ message: m, options: o });

	await checkGoalChainContinuation(manager, pi, ctx, createOneShotGoalChainContinuationState(), {
		allowWithoutActionableSubGoals: true,
	});

	assert.equal(calls.length, 0, "must not continue when there are no active chains");
});
