import assert from "node:assert/strict";
import test from "node:test";
import { GoalChainManager } from "../src/goal-chain.ts";

test("createGoalChain creates a chain with a reproductive clause v1", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Build a web app");

	assert.equal(chain.id.startsWith("chain-"), true);
	assert.equal(chain.primaryGoal, "Build a web app");
	assert.equal(chain.reproductiveClause.version, 1);
	assert.equal(chain.subGoals.length, 0);
	assert.equal(chain.status, "active");
	assert.equal(chain.currentGeneration, 1);
});

test("createGoalChain with initialSubGoals creates those sub-goals", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", ["Principle 1"], ["Sub 1", "Sub 2"]);

	assert.equal(chain.subGoals.length, 2);
	assert.equal(chain.subGoals[0].objective, "Sub 1");
	assert.equal(chain.subGoals[0].status, "pending");
	assert.equal(chain.subGoals[0].generation, 1);
	assert.equal(chain.subGoals[1].objective, "Sub 2");
	assert.ok(chain.subGoals[0].id.startsWith("subgoal-"));
	assert.ok(chain.subGoals[1].id.startsWith("subgoal-"));
});

test("addSubGoals adds sub-goals with unique IDs", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task");
	const added = manager.addSubGoals(chain.id, ["New sub 1", "New sub 2"]);

	assert.equal(added.length, 2);
	assert.equal(chain.subGoals.length, 2);
	assert.equal(added[0].objective, "New sub 1");
	assert.equal(added[1].objective, "New sub 2");
	assert.notEqual(added[0].id, added[1].id);
});

test("addSubGoals to unknown chain throws", () => {
	const manager = new GoalChainManager();
	assert.throws(() => manager.addSubGoals("chain-999", ["X"]), /not found/);
});

test("updateSubGoalStatus activates and completes a sub-goal", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", undefined, ["Do it"]);
	const subGoal = chain.subGoals[0];

	const updated = manager.updateSubGoalStatus(chain.id, subGoal.id, "active");
	assert.equal(updated.status, "active");

	const completed = manager.updateSubGoalStatus(chain.id, subGoal.id, "complete", ["Learned something"]);
	assert.equal(completed.status, "complete");
	assert.ok(completed.completedAt);
});

test("updateSubGoalStatus records learnings in record space on completion", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", undefined, ["Step 1"]);
	const subGoal = chain.subGoals[0];

	manager.updateSubGoalStatus(chain.id, subGoal.id, "complete", ["Learning A", "Learning B"]);
	assert.equal(chain.recordSpace.length, 2); // initial + completion
	const completionEntry = chain.recordSpace[1];
	assert.equal(completionEntry.type, "goal_completed");
	assert.ok(completionEntry.learnings?.includes("Learning A"));
	assert.ok(completionEntry.learnings?.includes("Learning B"));
});

test("updateSubGoalStatus with numeric index works", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", undefined, ["First", "Second"]);

	// Use numeric index 1 (1-based)
	const updated = manager.updateSubGoalStatus(chain.id, "1", "active");
	assert.equal(updated.objective, "First");

	// Use numeric index 2
	const updated2 = manager.updateSubGoalStatus(chain.id, "2", "active");
	assert.equal(updated2.objective, "Second");
});

test("mutateReproductiveClause increments version and preserves principles", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", ["Principle A", "Principle B"]);

	const mutation = manager.mutateReproductiveClause(
		chain.id,
		undefined,
		["Principle A", "Principle B", "Principle C"],
		"Test mutation",
		0.8,
	);

	assert.equal(mutation.newClause.version, 2);
	assert.equal(mutation.newClause.essentialPrinciples.length, 3);
	assert.ok(mutation.newClause.essentialPrinciples.includes("Principle A"));
	assert.ok(mutation.newClause.essentialPrinciples.includes("Principle B"));
});

test("mutateReproductiveClause with removePrinciples removes matching ones", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", ["Keep", "Remove me"]);

	const mutation = manager.mutateReproductiveClause(
		chain.id,
		undefined,
		["Keep", "Remove me"],
		"Remove one",
		0.8,
		["Remove me"],
	);

	assert.equal(mutation.newClause.essentialPrinciples.length, 1);
	assert.equal(mutation.newClause.essentialPrinciples[0], "Keep");
});

test("mutateReproductiveClause refuses to remove all principles", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", ["Only one"]);

	// Pass undefined for newPrinciples so it falls back to the chain's ["Only one"]
	// then try to remove it — should be refused
	assert.throws(
		() => manager.mutateReproductiveClause(chain.id, undefined, undefined, "Remove all", 0.8, ["Only one"]),
		/Subtractive mutation would remove all essential principles/
	);
});

test("inferSubGoals infers next steps when no actionable work remains", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Build a stable, well-tested application");
	// No sub-goals initially — inference should suggest decomposition
	const inferred = manager.inferSubGoals(chain.id);
	assert.ok(inferred.length > 0, "Should infer at least one sub-goal when no actionable work exists");
	assert.ok(inferred[0].inferredFromRecord);
});

test("inferSubGoals infers alternatives for blocked goals", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", undefined, ["Blocked goal"]);
	const subGoal = chain.subGoals[0];

	manager.updateSubGoalStatus(chain.id, subGoal.id, "blocked");
	const inferred = manager.inferSubGoals(chain.id);
	assert.ok(inferred.length > 0, "Should infer alternative for blocked goal");
	assert.ok(inferred[0].inferredFromRecord);
});

test("getChainStatistics returns correct counts", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", undefined, ["One", "Two", "Three"]);

	manager.updateSubGoalStatus(chain.id, "1", "complete");
	manager.updateSubGoalStatus(chain.id, "2", "blocked");
	manager.updateSubGoalStatus(chain.id, "3", "active");

	const stats = manager.getChainStatistics(chain);
	assert.equal(stats.totalSubGoals, 3);
	assert.equal(stats.completedSubGoals, 1);
	assert.equal(stats.blockedSubGoals, 1);
	assert.equal(stats.activeSubGoals, 1);
	assert.equal(stats.successRate, 1 / 3);
});

test("deleteGoalChain removes the chain and its cache", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task");
	assert.ok(manager.getGoalChain(chain.id));

	const deleted = manager.deleteGoalChain(chain.id);
	assert.equal(deleted, true);
	assert.equal(manager.getGoalChain(chain.id), null);
});

test("loadFromSession with empty entries creates no chains", () => {
	const manager = new GoalChainManager();
	manager.loadFromSession({ getEntries: () => [] });
	assert.equal(manager.getAllGoalChains().length, 0);
});

test("getPersistenceSnapshot captures full chain state", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", ["P1"], ["SG1"]);
	manager.updateSubGoalStatus(chain.id, "1", "complete", ["Learning"]);

	const snapshot = manager.getPersistenceSnapshot();
	assert.equal(snapshot.schemaVersion, 1);
	assert.equal(snapshot.chains.length, 1);
	assert.equal(snapshot.chains[0].primaryGoal, "Task");
	assert.equal(snapshot.chains[0].subGoals.length, 1);
});

// ===================== Session Validation =====================

test("GoalChainManager.validateEntry returns valid for good entry", () => {
	const entry = {
		schemaVersion: 1,
		chainIdCounter: 1,
		subGoalIdCounter: 1,
		chains: [{
			id: "chain-1",
			primaryGoal: "Test goal",
			reproductiveClause: {
				primaryGoal: "Test goal",
				essentialPrinciples: ["Principle 1"],
				mutationGuidelines: [],
				invariantConstraints: [],
				version: 1,
				lifelineTimestamp: Date.now(),
			},
			subGoals: [],
			status: "active",
			currentGeneration: 1,
			totalGenerations: 1,
			recordSpace: [],
			createdAt: Date.now(),
			lastMutationAt: Date.now(),
		}],
	};
	const result = GoalChainManager.validateEntry(entry);
	assert.ok(result.valid, "Should be valid");
	assert.equal(result.version, 1);
	assert.equal(result.chainCount, 1);
	assert.equal(result.skippedChains.length, 0);
});

test("GoalChainManager.validateEntry rejects null/invalid entries", () => {
	const result1 = GoalChainManager.validateEntry(null);
	assert.ok(!result1.valid);

	const result2 = GoalChainManager.validateEntry("string");
	assert.ok(!result2.valid);

	const result3 = GoalChainManager.validateEntry({});
	assert.ok(!result3.valid);
});

test("GoalChainManager.validateEntry skips chains missing id or primaryGoal", () => {
	const validChain = {
		id: "chain-1", primaryGoal: "Good",
		reproductiveClause: { primaryGoal: "Good", essentialPrinciples: [], mutationGuidelines: [], invariantConstraints: [], version: 1, lifelineTimestamp: Date.now() },
	};
	const entry = {
		schemaVersion: 1,
		chainIdCounter: 1,
		subGoalIdCounter: 1,
		chains: [
			validChain,
			{ id: null, primaryGoal: "No id" },
			{ id: "chain-3", primaryGoal: null },
		],
	};
	const result = GoalChainManager.validateEntry(entry);
	assert.ok(result.valid);
	assert.equal(result.chainCount, 1);
	assert.equal(result.skippedChains.length, 2);
});

test("GoalChainManager.validateEntry warns on old schema version", () => {
	const entry = {
		schemaVersion: 0,
		chainIdCounter: 1,
		subGoalIdCounter: 1,
		chains: [{ id: "chain-1", primaryGoal: "Old schema" }],
	};
	const result = GoalChainManager.validateEntry(entry);
	assert.ok(!result.valid);
	assert.ok(result.warnings.some(w => w.includes("below minimum")));
});

test("GoalChainManager.validateEntry warns on future schema version", () => {
	const entry = {
		schemaVersion: 99,
		chainIdCounter: 1,
		subGoalIdCounter: 1,
		chains: [{ id: "chain-1", primaryGoal: "Future schema" }],
	};
	const result = GoalChainManager.validateEntry(entry);
	assert.ok(result.warnings.some(w => w.includes("newer than current")));
});

test("GoalChainManager.validateEntry skips chains with invalid reproductive clause", () => {
	const entry = {
		schemaVersion: 1,
		chainIdCounter: 1,
		subGoalIdCounter: 1,
		chains: [
			{ id: "chain-1", primaryGoal: "Good", reproductiveClause: null },
			{ id: "chain-2", primaryGoal: "Good2" },
		],
	};
	const result = GoalChainManager.validateEntry(entry);
	assert.equal(result.chainCount, 0);
	assert.ok(!result.valid);
	assert.equal(result.skippedChains.length, 2);
});
