import assert from "node:assert/strict";
import test from "node:test";
import { GoalContinuation } from "../src/goal-continuation.ts";
import { GoalManager } from "../src/goal-manager.ts";

function createContinuation(goalObjective = "Ship smart continuation", tokenBudget) {
	const manager = new GoalManager();
	manager.createGoal(goalObjective, tokenBudget);
	const messages = [];
	const calls = [];
	const pi = {
		sendUserMessage(message, options) {
			messages.push(message);
			calls.push({ message, options });
		},
	};
	return { manager, continuation: new GoalContinuation(manager, pi), messages, calls };
}

function idleCtx(contextPercent) {
	return {
		isIdle: () => true,
		getContextUsage: () => contextPercent === undefined ? undefined : { percent: contextPercent },
	};
}

test("GoalContinuation exposes an initial adaptive continuation plan", () => {
	const { continuation } = createContinuation();
	const plan = continuation.getContinuationPlan(idleCtx(0.2));
	assert.equal(plan.strategy, "initial");
	assert.equal(plan.intervalMs, 1000);
	assert.equal(plan.contextPercent, 20);
	assert.ok(plan.guidance.some((item) => item.includes("next concrete action")));
});

test("GoalContinuation becomes budget-conservative as token budget is consumed", () => {
	const { manager, continuation } = createContinuation("Budgeted work", 1000);
	manager.accountUsage(850);
	const plan = continuation.getContinuationPlan(idleCtx());
	assert.equal(plan.strategy, "budget_conservative");
	assert.equal(plan.intervalMs, 10000);
	assert.equal(plan.budgetPercentUsed, 85);
	assert.ok(plan.guidance.some((item) => item.includes("Token budget is tight")));
});

test("GoalContinuation prefers handoff guidance when context is nearly full", () => {
	const { continuation } = createContinuation();
	const plan = continuation.getContinuationPlan(idleCtx(0.93));
	assert.equal(plan.strategy, "context_handoff");
	assert.equal(plan.intervalMs, 15000);
	assert.ok(plan.guidance.some((item) => item.includes("Context is nearly full")));
});

test("GoalContinuation triggerNow sends context-aware steering", async () => {
	const { manager, continuation, messages } = createContinuation("Implement parser", 1000);
	manager.accountUsage(600);
	await continuation.triggerNow(idleCtx(80));
	assert.equal(messages.length, 1);
	assert.match(messages[0], /Continuation Strategy:/);
	assert.match(messages[0], /Strategy: initial/);
	assert.match(messages[0], /Token Budget:/);
	assert.match(messages[0], /Used: 600\/1000 tokens/);
	assert.match(messages[0], /Context Usage:/);
	assert.match(messages[0], /Current context: 80% full/);
	assert.match(messages[0], /smallest verifiable increment/);
});

test("GoalContinuation triggerNow delivers continuation as followUp so it survives the turn_end streaming window", async () => {
	// Regression guard for the continuation halt: pi's isStreaming is still true
	// during turn_end handling, so sendUserMessage without deliverAs would throw
	// and be swallowed. The continuation must be queued as followUp.
	const { continuation, calls } = createContinuation();
	await continuation.triggerNow(idleCtx());
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0].options, { deliverAs: "followUp" },
		"continuation sendUserMessage must pass { deliverAs: 'followUp' }");
});

test("GoalContinuation checkContinuation also delivers as followUp", async () => {
	const { continuation, calls } = createContinuation();
	continuation.enableContinuation();
	await continuation.checkContinuation(idleCtx());
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0].options, { deliverAs: "followUp" });
});

test("GoalContinuation checkContinuation respects adaptive interval", async () => {
	const { continuation, messages } = createContinuation();
	continuation.enableContinuation();
	await continuation.checkContinuation(idleCtx());
	await continuation.checkContinuation(idleCtx());
	assert.equal(messages.length, 1, "second continuation should be throttled by adaptive interval");
});

test("GoalContinuation returns no plan for inactive goals", () => {
	const { manager, continuation } = createContinuation();
	manager.updateGoalStatus("paused");
	assert.equal(continuation.getContinuationPlan(idleCtx()), null);
});
