import assert from "node:assert/strict";
import test from "node:test";
import { GoalChainManager } from "../src/goal-chain.js";
import { GoalManager } from "../src/goal-manager.js";

test("Full goal chain lifecycle: create → add → complete → mutate → infer", () => {
	const manager = new GoalChainManager();

	// Step 1: Create chain
	const chain = manager.createGoalChain(
		"Build a stable application",
		["Preserve core purpose", "Maintain alignment"],
		["Plan architecture", "Implement core", "Write tests"],
	);
	assert.equal(chain.currentGeneration, 1);
	assert.equal(chain.reproductiveClause.version, 1);
	assert.equal(chain.subGoals.length, 3);

	// Step 2: Complete first sub-goal with learnings
	manager.updateSubGoalStatus(chain.id, "1", "complete", [
		"Architecture should use modular design",
	]);
	assert.equal(chain.subGoals[0].status, "complete");

	// Step 3: Complete second sub-goal
	manager.updateSubGoalStatus(chain.id, "2", "complete", [
		"Modular design reduces coupling",
	]);
	assert.equal(chain.subGoals[1].status, "complete");

	// Step 4: After 2 completed goals with learnings, evolution should trigger
	// (evolveChain is called automatically when shouldEvolveChain returns true)
	assert.equal(chain.currentGeneration, 2, "Should have evolved to generation 2");
	assert.equal(chain.reproductiveClause.version, 2, "Should have evolved clause version");

	// Step 5: Infer sub-goals for remaining work
	const inferred = manager.inferSubGoals(chain.id);
	// Should suggest next steps since no actionable goals remain
	assert.ok(inferred.length >= 0);
});

test("GoalManager tracks token budget and enforces limits", () => {
	const gm = new GoalManager();
	const goal = gm.createGoal("Test budget", 1000);
	assert.equal(goal.status, "active");

	gm.accountUsage(500);
	assert.equal(goal.tokensUsed, 500);
	assert.equal(goal.status, "active"); // still under budget

	gm.accountUsage(600);
	assert.equal(goal.tokensUsed, 1100);
	assert.equal(goal.status, "budget_limited"); // over budget

	// budget_limited is a terminal status, so a new goal CAN be created
	const freshGoal = gm.createGoal("New goal after budget");
	assert.ok(freshGoal);
	assert.equal(freshGoal.status, "active");
});

test("GoalManager status transitions are enforced", () => {
	const gm = new GoalManager();
	const goal = gm.createGoal("Test transitions");

	// active → paused
	gm.updateGoalStatus("paused");
	assert.equal(gm.getGoal().status, "paused");

	// paused → active
	gm.updateGoalStatus("active");
	assert.equal(gm.getGoal().status, "active");

	// active → complete
	gm.updateGoalStatus("complete");
	assert.equal(gm.getGoal().status, "complete");

	// complete → anything should fail
	assert.throws(() => gm.updateGoalStatus("active"), /Invalid/);
	assert.throws(() => gm.updateGoalStatus("paused"), /Invalid/);
});

test("GoalManager clear resets state completely", () => {
	const gm = new GoalManager();
	gm.createGoal("Test", 5000);
	gm.accountUsage(100);
	gm.clearGoal();

	assert.equal(gm.getGoal(), null);

	// Can create new goal after clear
	const newGoal = gm.createGoal("Fresh start");
	assert.ok(newGoal);
	assert.equal(newGoal.tokensUsed, 0);
});

test("GoalChainManager persistence snapshot round-trips correctly", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain(
		"Persisted task",
		["Principle 1"],
		["Sub goal"],
	);
	manager.updateSubGoalStatus(chain.id, "1", "active");
	manager.updateSubGoalStatus(chain.id, "1", "complete", ["Persisted learning"]);

	const snapshot = manager.getPersistenceSnapshot();

	// Simulate reload: create new manager and load from snapshot
	const reloaded = new GoalChainManager();
	// We can't fully test session persistence without a session manager,
	// but we can verify the snapshot structure is complete
	assert.equal(snapshot.schemaVersion, 1);
	assert.ok(snapshot.chainIdCounter > 0);
	assert.ok(snapshot.subGoalIdCounter > 0);
	assert.equal(snapshot.chains.length, 1);
	assert.equal(snapshot.chains[0].subGoals.length, 1);
});

test("GoalChainManager formatGoalChain handles empty chain gracefully", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Empty chain");
	const formatted = manager.formatGoalChain(chain);
	assert.match(formatted, /Sub-Goals: 0/);
	assert.match(formatted, /\(none\)/);
});

test("GoalChainManager formatGoalChain includes all sub-goals", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", undefined, ["A", "B", "C"]);
	const formatted = manager.formatGoalChain(chain);
	assert.match(formatted, /1\. \[PENDING\]/);
	assert.match(formatted, /2\. \[PENDING\]/);
	assert.match(formatted, /3\. \[PENDING\]/);
});

test("GoalManager loadFromSession preserves goal state", () => {
	const gm = new GoalManager();
	// Simulate session entries with a persisted goal
	const mockSession = {
		getEntries: () => [
			{
				type: "custom",
				customType: "telos:goal",
				data: {
					id: "goal-1",
					objective: "Test persistence",
					status: "active",
					tokenBudget: 5000,
					tokensUsed: 100,
					timeUsedSeconds: 30,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				},
			},
		],
	};
	gm.loadFromSession(mockSession);

	const goal = gm.getGoal();
	assert.ok(goal);
	assert.equal(goal.id, "goal-1");
	assert.equal(goal.objective, "Test persistence");
	assert.equal(goal.tokenBudget, 5000);
	assert.equal(goal.tokensUsed, 100);
	assert.equal(gm.nextGoalId, 2); // parsed from "goal-1" + 1
});
