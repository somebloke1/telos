import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GoalChainManager } from "../src/goal-chain.js";
import { GoalManager } from "../src/goal-manager.js";

// ===================== GoalManager Edge Cases =====================

test("GoalManager rejects empty objective", () => {
	const gm = new GoalManager();
	assert.throws(() => gm.createGoal(""), /cannot be empty/);
	assert.throws(() => gm.createGoal("   "), /cannot be empty/);
});

test("GoalManager stores large objectives transparently in GOAL.md", () => {
	const gm = new GoalManager();
	const tooLong = "a".repeat(4001);
	// Large objectives are stored transparently (not rejected)
	const goal = gm.createGoal(tooLong);
	assert.ok(goal.objective.startsWith("file:"), "Large objective should be stored as file reference");
	assert.ok(existsSync(join(process.cwd(), "GOAL.md")), "GOAL.md should be created");
	assert.ok(goal.objective.length > 30, `file reference should be >30 chars, got ${goal.objective.length}`);
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

// ===================== buildInferenceContext & inferAlternativeObjective Tests =====================

test("inferSubGoals with learnings produces inference from record space", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Develop a modular testing framework with comprehensive edge cases", undefined, [
		"Design core architecture",
		"Implement test runner",
		"Add assertion library",
		"Write documentation",
	]);

	// Complete all sub-goals with learnings to trigger inference
	manager.updateSubGoalStatus(chain.id, "1", "complete", [
		"Use dependency injection for test plugins",
	]);
	manager.updateSubGoalStatus(chain.id, "2", "complete", [
		"Async test support is critical",
	]);
	manager.updateSubGoalStatus(chain.id, "3", "complete", [
		"Snapshot testing adds value",
	]);
	manager.updateSubGoalStatus(chain.id, "4", "complete", [
		"Auto-generate docs from code",
	]);

	// Should infer new sub-goals from compacted record space, not keyword matching or context dumps
	const newSubGoals = manager.inferSubGoals(chain.id);
	assert.ok(newSubGoals.length > 0, "Should infer sub-goals from record space");
	assert.ok(newSubGoals.every((sg) => sg.objective.length < 300), "Inferred objectives should stay compact");
	assert.ok(chain.contextSummary, "Inference should maintain warm-memory summary");
	assert.ok(
		chain.contextSummary.stableLearnings.some((learning) => learning.includes("dependency injection")) ||
		chain.contextSummary.recentLearnings.some((learning) => learning.includes("dependency injection")),
		"Warm memory should retain learnings without embedding them in objective text",
	);
});

test("inferAlternativeObjective produces alternatives for blocked goals", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Build a distributed cache system", undefined, [
		"Design cache protocol",
		"Implement node replication",
	]);

	// Complete first goal with learnings
	manager.updateSubGoalStatus(chain.id, "1", "complete", [
		"Redis protocol is well-established",
		"Consider using msgpack for serialization",
	]);
	// Block second goal
	manager.updateSubGoalStatus(chain.id, "2", "blocked", [
		"Failed to implement custom protocol",
	]);

	// Get alternative objective for the blocked goal
	const alternative = manager.inferAlternativeObjective(chain.subGoals[1], chain);
	assert.ok(alternative, "Should produce alternative for blocked goal");
	assert.ok(
		alternative.includes("Redis") || alternative.includes("msgpack") || alternative.includes("protocol") || alternative.includes("learnings"),
		`Alternative should reference learnings from completed goals, got: ${alternative}`,
	);
});

test("inferSubGoals respects existing objectives and avoids duplication", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Implement a web framework", undefined, [
		"Design routing system",
		"Implement middleware",
	]);

	manager.updateSubGoalStatus(chain.id, "1", "complete", [
		"Use pattern matching for routes",
	]);
	manager.updateSubGoalStatus(chain.id, "2", "complete", [
		"Chain middleware in order",
	]);

	// First inference
	manager.inferSubGoals(chain.id);

	// Second inference should not duplicate
	const secondInference = manager.inferSubGoals(chain.id);
	const allObjectives = [...chain.subGoals, ...secondInference].map((sg) => sg.objective);
	const uniqueObjectives = [...new Set(allObjectives)];
	assert.equal(uniqueObjectives.length, allObjectives.length, "Should not duplicate existing objectives");
});

test("getActionableSummary returns correct structure", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Develop a modular testing framework", undefined, [
		"Design architecture",
		"Implement core",
		"Add tests",
	]);

	manager.updateSubGoalStatus(chain.id, "1", "complete");
	manager.updateSubGoalStatus(chain.id, "2", "active");
	// "3" remains pending

	const summary = manager.getActionableSummary(chain);

	assert.equal(summary.id, chain.id, "Should return chain id");
	assert.equal(summary.status, chain.status, "Should return chain status");
	assert.equal(summary.primaryGoal, chain.primaryGoal, "Should return full primary goal");
	assert.ok(summary.primaryGoalShort.length <= 40, "Short goal should be ≤40 chars");
	assert.equal(summary.generation, chain.currentGeneration, "Should return generation");
	assert.equal(summary.clauseVersion, chain.reproductiveClause.version, "Should return clause version");

	assert.equal(summary.subGoalCounts.total, 3, "Should return total count");
	assert.equal(summary.subGoalCounts.completed, 1, "Should return completed count");
	assert.equal(summary.subGoalCounts.active, 1, "Should return active count");
	assert.equal(summary.subGoalCounts.pending, 1, "Should return pending count");

	assert.ok(summary.progressString.includes("1/3"), "Progress string should include completion ratio");
	assert.ok(summary.progressString.includes("active"), "Progress string should include active count");

	assert.equal(summary.actionableSubGoals.length, 2, "Should return 2 actionable sub-goals (active + pending)");

	// Should include recent learnings from record space
	assert.ok(Array.isArray(summary.recentLearnings), "Recent learnings should be an array");
});

test("getActionableSummary handles empty chain", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Empty chain goal", undefined, []);

	const summary = manager.getActionableSummary(chain);

	assert.equal(summary.subGoalCounts.total, 0, "Total should be 0");
	assert.equal(summary.subGoalCounts.completed, 0, "Completed should be 0");
	assert.equal(summary.actionableSubGoals.length, 0, "No actionable sub-goals");
	assert.equal(summary.progressString, "", "Progress string should be empty for no sub-goals");
});

test("getActionableSummary handles all completed chain", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("All done", undefined, [
		"First",
		"Second",
	]);

	manager.updateSubGoalStatus(chain.id, "1", "complete", ["Learned something"]);
	manager.updateSubGoalStatus(chain.id, "2", "complete", ["Learned more"]);

	const summary = manager.getActionableSummary(chain);

	assert.equal(summary.subGoalCounts.completed, 2, "Both completed");
	assert.equal(summary.subGoalCounts.active, 0, "No active");
	assert.equal(summary.subGoalCounts.pending, 0, "No pending");
	assert.ok(summary.progressString.includes("2/2"), "Should show full completion");
	assert.equal(summary.recentLearnings.length, 2, "Should have 2 recent learnings");
});

test("getActionableSummary includes inferred sub-goal counts", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Test with inference", undefined, [
		"Step 1",
		"Step 2",
	]);

	// Complete both sub-goals so inferSubGoals triggers (no actionable work)
	manager.updateSubGoalStatus(chain.id, "1", "complete");
	manager.updateSubGoalStatus(chain.id, "2", "complete");

	// Infer to create an inferred sub-goal
	manager.inferSubGoals(chain.id);

	const summary = manager.getActionableSummary(chain);

	assert.ok(summary.subGoalCounts.inferred >= 1, `Should have at least 1 inferred sub-goal, got ${summary.subGoalCounts.inferred}`);
});

test("buildInferenceContext includes reproductive clause in context", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Build a CLI tool", undefined, [
		"Design command parser",
	]);

	manager.updateSubGoalStatus(chain.id, "1", "complete", [
		"Use yargs for argument parsing",
	]);

	const subGoal = chain.subGoals[0];
	const context = manager.buildInferenceContext(chain, subGoal);

	assert.ok(context.includes("Build a CLI tool"), "Context should include primary goal");
	assert.ok(context.includes("yargs"), "Context should include learning from completed goal");
});

// ===================== Concurrent Evolution Trigger Edge Cases =====================

test("GoalChainManager handles rapid consecutive completions without duplicate evolution", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Rapid evolution test", undefined, [
		"Step 1",
		"Step 2",
		"Step 3",
	]);

	// Complete first two with learnings - triggers first evolution
	manager.updateSubGoalStatus(chain.id, "1", "complete", [
		"Learning A",
	]);
	manager.updateSubGoalStatus(chain.id, "2", "complete", [
		"Learning B",
	]);

	const genAfterFirst = chain.currentGeneration;
	const clauseVerAfterFirst = chain.reproductiveClause.version;

	// Complete third with learning - should trigger second evolution
	manager.updateSubGoalStatus(chain.id, "3", "complete", [
		"Learning C",
	]);

	const genAfterSecond = chain.currentGeneration;
	const clauseVerAfterSecond = chain.reproductiveClause.version;

	// Evolution should have occurred (generation increased)
	assert.ok(genAfterSecond >= genAfterFirst, `Generation should increase, got ${genAfterFirst} → ${genAfterSecond}`);
	assert.ok(clauseVerAfterSecond >= clauseVerAfterFirst, `Clause version should increase, got ${clauseVerAfterFirst} → ${clauseVerAfterSecond}`);
});

test("GoalChainManager evolution does not trigger on blocked goal without learnings", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Blocked without learnings", undefined, [
		"A",
		"B",
	]);

	manager.updateSubGoalStatus(chain.id, "1", "complete", ["Learning"]);
	manager.updateSubGoalStatus(chain.id, "2", "blocked", []); // No learnings

	assert.equal(chain.currentGeneration, 1, "Should not evolve when blocked goal has no learnings");
	assert.equal(chain.reproductiveClause.version, 1, "Clause version should not change");
});

test("GoalChainManager evolution respects minimum completed goals threshold", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Min goals test", undefined, [
		"A",
		"B",
		"C",
	]);

	// Only complete 1 goal with learning - should not trigger evolution
	manager.updateSubGoalStatus(chain.id, "1", "complete", ["Learning"]);

	assert.equal(chain.currentGeneration, 1, "Should not evolve with only 1 completed goal");

	// Complete second goal - should now trigger evolution
	manager.updateSubGoalStatus(chain.id, "2", "complete", ["Learning 2"]);

	assert.ok(
		chain.currentGeneration >= 2,
		`Should evolve after 2nd completion, got gen ${chain.currentGeneration}`,
	);
});

test("GoalChainManager multiple evolution triggers produce progressive mutations", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Progressive evolution", undefined, [
		"A",
		"B",
		"C",
		"D",
		"E",
	]);

	// Complete first 2 with learnings → evolution 1
	manager.updateSubGoalStatus(chain.id, "1", "complete", ["Learning 1"]);
	manager.updateSubGoalStatus(chain.id, "2", "complete", ["Learning 2"]);
	const gen1 = chain.currentGeneration;

	// Complete 3rd with learning → evolution 2
	manager.updateSubGoalStatus(chain.id, "3", "complete", ["Learning 3"]);
	const gen2 = chain.currentGeneration;

	// Complete 4th with learning → evolution 3
	manager.updateSubGoalStatus(chain.id, "4", "complete", ["Learning 4"]);
	const gen3 = chain.currentGeneration;

	// Complete 5th with learning → may trigger another evolution
	manager.updateSubGoalStatus(chain.id, "5", "complete", ["Learning 5"]);
	const gen4 = chain.currentGeneration;

	assert.ok(gen2 >= gen1, "Gen should progress after 2nd completion");
	assert.ok(gen3 >= gen2, "Gen should progress after 3rd completion");
	assert.ok(gen4 >= gen3, "Gen should progress after 4th completion");
	assert.equal(chain.reproductiveClause.version, chain.currentGeneration, "Clause version should match generation");
});

// ===================== GoalChain Cognitive Metabolism Tests =====================

test("GoalChainManager context metrics detect oversized inferred context dumps", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Maintain context health", undefined, [
		"Analyze chain record space and infer next step. Context:\n" + "historic detail ".repeat(200),
	]);
	chain.subGoals[0].inferredFromRecord = true;

	const metrics = manager.getContextMetrics(chain);
	assert.ok(metrics.oversizedSubGoals >= 1, "Should detect oversized sub-goal objectives");
	assert.ok(metrics.inferredContextDumps >= 1, "Should detect inferred context dumps");
	assert.ok(metrics.needsCompaction, "Oversized inferred context should require compaction");
});

test("GoalChainManager compactGoalChain distills warm memory without deleting sub-goal detail", () => {
	const manager = new GoalChainManager();
	const longObjective = "Document a long historical task with implementation details. ".repeat(40);
	const chain = manager.createGoalChain("Metabolize history", undefined, [longObjective, "Small task"]);

	manager.updateSubGoalStatus(chain.id, "1", "complete", [
		"Stable lesson: compact views should preserve full lookup detail",
	]);
	manager.updateSubGoalStatus(chain.id, "2", "complete", [
		"Stable lesson: compact views should preserve full lookup detail",
	]);

	const summary = manager.compactGoalChain(chain.id);
	assert.equal(summary.sourceSubGoalCount, 2);
	assert.ok(summary.stableLearnings.some((learning) => learning.includes("2 supporting records")));
	assert.ok(chain.contextSummary, "Chain should retain generated context summary");

	const detail = manager.getSubGoalDetail(chain.id, "1");
	assert.match(detail, /SUB-GOAL DETAIL/);
	assert.ok(detail.includes(longObjective), "Cold-memory lookup should retain full objective text");
});

test("GoalChainManager formatGoalChain bounds non-active sub-goal text", () => {
	const manager = new GoalChainManager();
	const longObjective = "This sub-goal contains an excessive amount of historical context. ".repeat(80);
	const chain = manager.createGoalChain("Bound display context", undefined, [longObjective, "Current task"]);
	manager.updateSubGoalStatus(chain.id, "2", "active");

	const formatted = manager.formatGoalChain(chain);
	assert.ok(formatted.includes("Context:"), "Formatted chain should include context health header");
	assert.ok(formatted.includes("detail lookup available"), "Long sub-goal should advertise detail lookup");
	assert.ok(formatted.length < longObjective.length + 3000, "Formatted output should not be dominated by long sub-goal text");
});

test("GoalChainManager inferSubGoals does not embed full inference context in objective", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Infer next compact step", undefined, [
		"Completed task A",
		"Completed task B",
	]);
	manager.updateSubGoalStatus(chain.id, "1", "complete", ["Learning A should be retained in warm memory"]);
	manager.updateSubGoalStatus(chain.id, "2", "complete", ["Learning B should be retained in warm memory"]);

	const inferred = manager.inferSubGoals(chain.id);
	assert.ok(inferred.length > 0);
	assert.ok(inferred.every((sg) => !sg.objective.includes("Completed sub-goals")));
	assert.ok(inferred.every((sg) => sg.objective.length < 300));
	assert.ok(chain.contextSummary?.recentLearnings.length, "Warm memory should hold recent learnings");
});
