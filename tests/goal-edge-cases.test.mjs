import assert from "node:assert/strict";
import test from "node:test";
import { GoalChainManager } from "../src/goal-chain.js";
import { GoalManager } from "../src/goal-manager.js";

// ===================== GoalManager Edge Cases =====================

test("GoalManager rejects empty objective", () => {
	const gm = new GoalManager();
	assert.throws(() => gm.createGoal(""), /cannot be empty/);
	assert.throws(() => gm.createGoal("   "), /cannot be empty/);
});

test("GoalManager rejects objective exceeding max length", () => {
	const gm = new GoalManager();
	const tooLong = "a".repeat(4001);
	assert.throws(() => gm.createGoal(tooLong), /exceeds maximum length/);
	// Boundary: exactly 4000 should work
	const exact = "a".repeat(4000);
	const goal = gm.createGoal(exact);
	assert.equal(goal.objective.length, 4000);
});

test("GoalManager.updateObjective trims whitespace", () => {
	const gm = new GoalManager();
	gm.createGoal("  Initial objective  ");
	gm.updateObjective("  Updated objective  ");
	assert.equal(gm.getGoal().objective, "Updated objective");
});

test("GoalManager.updateTokenBudget enforces positive budget", () => {
	const gm = new GoalManager();
	gm.createGoal("Test", 500);
	assert.throws(() => gm.updateTokenBudget(0), /must be positive/);
	assert.throws(() => gm.updateTokenBudget(-100), /must be positive/);
});

test("GoalManager.updateTokenBudget detects over-budget state", () => {
	const gm = new GoalManager();
	const goal = gm.createGoal("Test", 500);
	gm.accountUsage(400);
	gm.updateTokenBudget(300); // Now over budget
	assert.equal(goal.status, "budget_limited");
});

test("GoalManager.getStats returns correct values", () => {
	const gm = new GoalManager();
	const goal = gm.createGoal("Test", 10000);
	gm.accountUsage(3500);
	gm.getStats();
	const stats = gm.getStats();
	assert.equal(stats.tokensUsed, 3500);
	assert.equal(stats.budgetRemaining, 6500);
});

test("GoalManager.getStats returns null when no goal", () => {
	const gm = new GoalManager();
	assert.equal(gm.getStats(), null);
});

test("GoalManager prevents creating goal when non-terminal goal exists", () => {
	const gm = new GoalManager();
	gm.createGoal("Existing goal");
	assert.throws(() => gm.createGoal("New goal"), /unfinished goal/);
});

test("GoalManager allows creating new goal after terminal state", () => {
	const gm = new GoalManager();
	gm.createGoal("Old goal");
	gm.updateGoalStatus("complete");
	const newGoal = gm.createGoal("New goal after complete");
	assert.ok(newGoal);
	assert.equal(newGoal.id, "goal-2");
});

test("GoalManager allows creating new goal after blocked state", () => {
	const gm = new GoalManager();
	gm.createGoal("Blocked goal");
	gm.updateGoalStatus("blocked");
	const newGoal = gm.createGoal("New goal after blocked");
	assert.ok(newGoal);
});

test("GoalManager allows creating new goal after budget_limited state", () => {
	const gm = new GoalManager();
	const goal = gm.createGoal("Budget goal", 100);
	gm.accountUsage(200);
	assert.equal(goal.status, "budget_limited");
	const newGoal = gm.createGoal("New goal after budget");
	assert.ok(newGoal);
});

test("GoalManager tracks timeUsedSeconds via accountUsage", () => {
	// accountUsage only tracks tokens, not time - verify timeUsedSeconds stays 0
	const gm = new GoalManager();
	gm.createGoal("Time test", 1000);
	gm.accountUsage(100);
	assert.equal(gm.getGoal().timeUsedSeconds, 0);
});

// ===================== GoalChainManager Edge Cases =====================

test("GoalChainManager dedupes principles in mutateReproductiveClause", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", ["Principle A", "Principle B"]);

	const mutation = manager.mutateReproductiveClause(
		chain.id,
		undefined,
		["Principle A", "Principle A", "Principle B", "Principle B"],
		"Dedup test",
		0.8,
	);

	assert.equal(mutation.newClause.essentialPrinciples.length, 2);
	assert.ok(mutation.newClause.essentialPrinciples.includes("Principle A"));
	assert.ok(mutation.newClause.essentialPrinciples.includes("Principle B"));
});

test("GoalChainManager caps principles at 8 after mutation", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", [
		"P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10",
	]);

	const mutation = manager.mutateReproductiveClause(
		chain.id,
		undefined,
		["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"],
		"Cap test",
		0.8,
	);

	assert.equal(mutation.newClause.essentialPrinciples.length, 8);
});

test("GoalChainManager.principle dedupe is case-insensitive", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", ["principle a", "Principle A"]);

	const mutation = manager.mutateReproductiveClause(
		chain.id,
		undefined,
		["principle a", "Principle A"],
		"Case test",
		0.8,
	);

	assert.equal(mutation.newClause.essentialPrinciples.length, 1);
});

test("GoalChainManager getChainStatistics handles zero sub-goals", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Empty");
	const stats = manager.getChainStatistics(chain);
	assert.equal(stats.totalSubGoals, 0);
	assert.equal(stats.completedSubGoals, 0);
	assert.equal(stats.successRate, 0);
	assert.equal(stats.averageGeneration, 0);
});

test("GoalChainManager shouldEvolveChain requires learnings on completion", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", undefined, ["One", "Two"]);

	// Complete without learnings - should NOT evolve
	manager.updateSubGoalStatus(chain.id, "1", "complete");
	manager.updateSubGoalStatus(chain.id, "2", "complete");
	// No mutation should have occurred since learnings were empty
	assert.equal(chain.currentGeneration, 1);
	assert.equal(chain.reproductiveClause.version, 1);
});

test("GoalChainManager formatGoalChain with many completed sub-goals", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", undefined, [
		"A", "B", "C", "D", "E", "F", "G",
	]);
	for (let i = 1; i <= 7; i++) {
		manager.updateSubGoalStatus(chain.id, String(i), "complete", [
			`Learning ${i}`,
		]);
	}
	const formatted = manager.formatGoalChain(chain);
	// All completions are recent (same second), so all fit within the 24h window.
	// All 7 should display as [COMPLETE] with timestamps.
	const completeCount = (formatted.match(/\[COMPLETE\]/g) || []).length;
	assert.ok(completeCount >= 7, `Expected at least 7 [COMPLETE] entries, got ${completeCount}`);
});

test("GoalChainManager inferSubGoals for complex long primary goal", () => {
	const manager = new GoalChainManager();
	const longGoal =
		"Design and implement a comprehensive microservice architecture with authentication, " +
		"payment processing, inventory management, user roles, notifications, analytics dashboard, " +
		"and automated deployment pipeline with rollback capabilities and monitoring alerts";
	const chain = manager.createGoalChain(longGoal);

	const inferred = manager.inferSubGoals(chain.id);
	assert.ok(inferred.length > 0, "Should infer steps for complex long primary goal");
});

test("GoalChainManager inferSubGoals does not duplicate existing objectives", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Build a web app", undefined, ["Plan database"]);
	const subGoal = chain.subGoals[0];

	// Complete it to remove from actionable set
	manager.updateSubGoalStatus(chain.id, subGoal.id, "complete", ["DB plan done"]);

	// Infer - should not suggest "Plan database" again
	const inferred = manager.inferSubGoals(chain.id);
	const existing = chain.subGoals
		.filter((sg) => sg.status !== "complete" && !sg.inferredFromRecord)
		.map((sg) => sg.objective.toLowerCase());

	for (const goal of inferred) {
		assert.ok(
			!existing.some((e) => e === goal.objective.toLowerCase()),
			`Inferred goal "${goal.objective}" duplicates existing`,
		);
	}
});

test("GoalChainManager updateSubGoalStatus with invalid sub-goal ID throws", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task");
	assert.throws(
		() => manager.updateSubGoalStatus(chain.id, "nonexistent", "complete"),
		/not found/,
	);
});

test("GoalChainManager updateSubGoalStatus with out-of-range numeric index throws", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", undefined, ["A", "B"]);
	assert.throws(
		() => manager.updateSubGoalStatus(chain.id, "999", "complete"),
		/not found/,
	);
});

test("GoalChainManager loadFromSession skips invalid chains", () => {
	const manager = new GoalChainManager();
	const mockSession = {
		getEntries: () => [
			{ type: "custom", customType: "telos:goal-chains", data: { chains: [] } },
			{ type: "custom", customType: "telos:goal-chains", data: null },
			{
				type: "custom",
				customType: "telos:goal-chains",
				data: {
					schemaVersion: 1,
					chainIdCounter: 2,
					subGoalIdCounter: 3,
					chains: [
						null, // invalid - null chain
						{}, // invalid - no id or primaryGoal
						{
							id: "chain-1",
							primaryGoal: "Valid chain",
							reproductiveClause: {
								primaryGoal: "Valid chain",
								essentialPrinciples: ["P1"],
								invariantConstraints: [],
								mutationGuidelines: ["M1"],
								lifelineTimestamp: Date.now(),
								version: 1,
							},
							subGoals: [],
							currentGeneration: 1,
							totalGenerations: 1,
							recordSpace: [],
							status: "active",
							createdAt: Date.now(),
							lastMutationAt: Date.now(),
						},
					],
				},
			},
		],
	};
	manager.loadFromSession(mockSession);
	const chains = manager.getAllGoalChains();
	assert.equal(chains.length, 1);
	assert.equal(chains[0].id, "chain-1");
});

test("GoalChainManager recordSpace trims at 100 entries", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", undefined, ["A", "B"]);
	manager.updateSubGoalStatus(chain.id, "1", "active");
	// Add enough record entries via multiple updates
	for (let i = 0; i < 120; i++) {
		const sgId = (i % 2 === 0) ? "1" : "2";
		manager.updateSubGoalStatus(chain.id, sgId, i % 3 === 0 ? "complete" : "active", [
			`Learning ${i}`,
		]);
	}
	// Record space should be trimmed to at most 100 (actually 50 due to slice(-50))
	assert.ok(chain.recordSpace.length <= 100, `Record space should be trimmed, got ${chain.recordSpace.length}`);
});

// ===================== GoalChainManager Evolve Chain Edge Cases =====================

test("GoalChainManager evolveChain with insufficient learnings does not mutate", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", undefined, ["One", "Two", "Three"]);

	// Complete sub-goals WITHOUT learnings
	manager.updateSubGoalStatus(chain.id, "1", "complete");
	manager.updateSubGoalStatus(chain.id, "2", "complete");

	assert.equal(chain.currentGeneration, 1, "Should not evolve without learnings");
	assert.equal(chain.reproductiveClause.version, 1);
});

test("GoalChainManager evolveChain with blocked goal and learnings triggers evolution", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Task", undefined, ["One", "Two", "Three"]);

	// Complete first two with learnings (required threshold for evolution)
	manager.updateSubGoalStatus(chain.id, "1", "complete", [
		"Should use modular design",
	]);
	manager.updateSubGoalStatus(chain.id, "2", "complete", [
		"Modular design reduces coupling",
	]);
	// Then block third with learning - triggers another evolution since completedGoals >= 2
	manager.updateSubGoalStatus(chain.id, "3", "blocked", [
		"Should use modular design",
	]);

	assert.ok(
		chain.currentGeneration >= 2,
		`Should evolve after blocked goal with learnings, got gen ${chain.currentGeneration}`,
	);
	assert.ok(
		chain.reproductiveClause.version >= 2,
		`Clause version should be ≥2, got ${chain.reproductiveClause.version}`,
	);
});
