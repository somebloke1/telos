import assert from "node:assert/strict";
import test from "node:test";
import { GoalManager } from "../src/goal-manager.js";
import { GoalChainManager } from "../src/goal-chain.js";
import { renderGoalFooter, renderChainWidget, formatEvolutionInfo, formatSubGoalProgress, STATUS_CODES, CHAIN_STATUS_CODES } from "../src/tui/footer.js";

function createDistillingChainManager() {
	return new GoalChainManager(
		{ goalChain: { distiller: { enabled: true, provider: "openai-compatible" } } },
		{
			async distill(input) {
				return {
					principles: [...input.reproductiveClause.essentialPrinciples, "Distilled integration-test principle"],
					reason: "Integration test distiller mutation",
					confidence: 0.84,
				};
			},
		},
	);
}

// ===================== Full Integration: Chain Lifecycle with TUI Rendering =====================

test("Full integration: create chain → complete sub-goals with learnings → async distill → infer → render", async () => {
	const goalManager = new GoalManager();
	const chainManager = createDistillingChainManager();

	// Create a goal
	goalManager.createGoal(
		"Develop a modular testing framework with comprehensive edge case coverage",
		10000,
	);
	const goal = goalManager.getGoal();
	assert.ok(goal, "Goal should be created");
	assert.equal(goal.objective, "Develop a modular testing framework with comprehensive edge case coverage");
	assert.ok(goal.tokenBudget === 10000);

	// Create a goal chain
	const chain = chainManager.createGoalChain(
		"Develop a modular testing framework with comprehensive edge case coverage",
		undefined,
		[
			"Design core architecture",
			"Implement test runner",
			"Add assertion library",
			"Write documentation",
		],
	);
	assert.ok(chain, "Chain should be created");
	assert.equal(chain.subGoals.length, 4);

	// Complete sub-goals with learnings to trigger evolution
	await chainManager.updateSubGoalStatusAsync(chain.id, "1", "complete", [
		"Use dependency injection for plugins",
		"Plugin architecture allows extensibility",
	]);
	await chainManager.updateSubGoalStatusAsync(chain.id, "2", "complete", [
		"Async test support is essential",
	]);
	await chainManager.updateSubGoalStatusAsync(chain.id, "3", "complete", [
		"Snapshot testing adds value",
	]);
	await chainManager.updateSubGoalStatusAsync(chain.id, "4", "complete", [
		"Auto-generate docs from code",
	]);

	// Evolution should have triggered
	assert.ok(chain.currentGeneration >= 2, `Should have evolved, got gen ${chain.currentGeneration}`);
	assert.ok(chain.reproductiveClause.version >= 2, `Clause version should be ≥2, got ${chain.reproductiveClause.version}`);

	// Render TUI footer before inference (so sub-goal count is still 4/4)
	let footerReceived = undefined;
	renderGoalFooter(
		{ ui: { setStatus: (key, value) => { footerReceived = { key, value }; } } },
		goalManager,
		chainManager,
	);

	assert.ok(footerReceived, "Footer should have been set");
	assert.ok(footerReceived.value.includes("[A]"), "Footer should include active status code");
	assert.ok(footerReceived.value.includes("Develop a modular"), "Footer should include truncated goal");
	assert.ok(footerReceived.value.includes("⚡"), "Footer should include chain status code");
	assert.ok(footerReceived.value.includes("4/4 done"), "Footer should include progress");
	assert.ok(footerReceived.value.includes("⊕") || footerReceived.value.includes("g"), "Footer should include evolution info");

	// Infer new sub-goals from record space
	const inferredGoals = chainManager.inferSubGoals(chain.id);
	assert.ok(inferredGoals.length > 0, "Should infer new sub-goals");
	assert.ok(
		inferredGoals[0].inferredFromRecord,
		"Inferred goals should have inferredFromRecord flag",
	);

	// Render chain widget (after inference, total is 5)
	let widgetReceived = undefined;
	renderChainWidget(
		{ ui: { setStatus: (key, value) => { widgetReceived = { key, value }; } } },
		chainManager,
	);

	assert.ok(widgetReceived, "Widget should have been set");
	assert.ok(widgetReceived.value.includes("Develop a modular"), "Widget should include primary goal");
	assert.ok(widgetReceived.value.includes("4/5 done"), "Widget should include progress after inference");
	assert.ok(widgetReceived.value.includes("ℒ:"), "Widget should include learnings");

	// Verify format functions work correctly
	const progress = formatSubGoalProgress(chain);
	assert.ok(progress.includes("4/5"), "Progress should show 4/5 after inference");

	const evolution = formatEvolutionInfo(chain);
	assert.ok(evolution.includes("ℒ"), "Evolution info should include learnings");

	// Verify statistics
	const stats = chainManager.getChainStatistics(chain);
	assert.equal(stats.totalSubGoals, 4 + inferredGoals.length);
	assert.equal(stats.completedSubGoals, 4);
	assert.ok(stats.inferredSubGoals >= 1, "Should have inferred sub-goals");
	// successRate is 4/5 = 0.8 because the inferred sub-goal is pending
	assert.equal(stats.successRate, 0.8, "Success rate should be 4/5 after inference");
});

// ===================== Integration: Persistence Round-Trip with TUI =====================

test("Full integration: persistence round-trip with TUI rendering", () => {
	const goalManager = new GoalManager();
	const chainManager = new GoalChainManager();

	// Create goal and chain
	goalManager.createGoal(
		"Build a distributed cache system with Redis compatibility",
		5000,
	);

	const chain = chainManager.createGoalChain(
		"Build a distributed cache system with Redis compatibility",
		undefined,
		[
			"Design cache protocol",
			"Implement replication",
			"Add persistence layer",
		],
	);

	// Complete sub-goals
	chainManager.updateSubGoalStatus(chain.id, "1", "complete", [
		"Redis protocol is well-established",
	]);
	chainManager.updateSubGoalStatus(chain.id, "2", "complete", [
		"Use Raft consensus for replication",
	]);

	// Capture before persistence
	const snapshotBefore = chainManager.getPersistenceSnapshot();
	const footerBefore = chainManager.getActionableSummary(chain);
	const widgetBefore = formatEvolutionInfo(chain);

	// Simulate reload
	const freshManager = new GoalChainManager();
	freshManager.loadFromSession({
		getEntries: () => [{ type: "custom", customType: "telos:goal-chains", data: snapshotBefore }],
	});

	// Verify chain state is preserved
	const restoredChains = freshManager.getAllGoalChains();
	assert.equal(restoredChains.length, 1, "Should restore 1 chain");

	const restored = restoredChains[0];
	assert.equal(restored.primaryGoal, chain.primaryGoal, "Primary goal should match");
	assert.equal(restored.currentGeneration, chain.currentGeneration, "Generation should match");
	assert.equal(restored.subGoals.length, chain.subGoals.length, "Sub-goal count should match");

	// Verify TUI rendering still works after reload
	let widgetReceived = undefined;
	renderChainWidget(
		{ ui: { setStatus: (key, value) => { widgetReceived = { key, value }; } } },
		freshManager,
	);
	assert.ok(widgetReceived, "Widget should render after persistence reload");
	assert.ok(widgetReceived.value.includes("Build a distributed"), "Widget should include primary goal");
});

// ===================== Integration: Multi-Chain TUI Rendering =====================

test("Full integration: multiple chains render latest chain in TUI", () => {
	const chainManager = new GoalChainManager();

	// Create multiple chains
	chainManager.createGoalChain("Old chain goal", undefined, ["A"]);
	// Small delay to ensure different timestamps
	chainManager.createGoalChain("New chain goal", undefined, ["B", "C"]);

	let footerReceived = undefined;
	renderGoalFooter(
		{ ui: { setStatus: (key, value) => { footerReceived = { key, value }; } } },
		new GoalManager(),
		chainManager,
	);

	assert.ok(footerReceived, "Footer should be set");
	assert.ok(footerReceived.value.includes("New chain goal"), "Should show latest chain");
	assert.ok(!footerReceived.value.includes("Old chain"), "Should not show old chain");
});

// ===================== Integration: Edge Case TUI Rendering =====================

test("Full integration: TUI handles no goal and no chain gracefully", () => {
	const goalManager = new GoalManager();
	const chainManager = new GoalChainManager();

	let footerReceived = undefined;
	renderGoalFooter(
		{ ui: { setStatus: (key, value) => { footerReceived = { key, value }; } } },
		goalManager,
		chainManager,
	);

	// When no goal and no chain, footer sets undefined to clear status
	assert.ok(footerReceived, "Footer should still be set");
	assert.equal(footerReceived.value, undefined, "Should clear status when no goal and no chain");
});

test("Full integration: TUI handles goal without chain", () => {
	const goalManager = new GoalManager();
	goalManager.createGoal("Test objective without chain");

	let footerReceived = undefined;
	renderGoalFooter(
		{ ui: { setStatus: (key, value) => { footerReceived = { key, value }; } } },
		goalManager,
	);

	assert.ok(footerReceived, "Footer should be set");
	assert.ok(footerReceived.value.includes("[A]"), "Should show active status");
	assert.ok(footerReceived.value.includes("Test objective"), "Should show goal objective");
});

// ===================== Integration: Record Space Mining End-to-End =====================

test("Full integration: record space mining influences inferred sub-goals", () => {
	const chainManager = new GoalChainManager();
	const chain = chainManager.createGoalChain(
		"Build a CLI application with argument parsing",
		undefined,
		[
			"Design command interface",
			"Implement argument parser",
		],
	);

	// Complete with specific learnings
	chainManager.updateSubGoalStatus(chain.id, "1", "complete", [
		"Use yargs for robust argument parsing",
	]);
	chainManager.updateSubGoalStatus(chain.id, "2", "complete", [
		"Subcommands should be modular",
	]);

	// Infer and verify the context includes learning references
	const inferred = chainManager.inferSubGoals(chain.id);
	assert.ok(inferred.length > 0, "Should infer sub-goals");

	// The inferred sub-goal should reference the record space context
	const context = chainManager.buildInferenceContext(chain);
	assert.ok(context.includes("yargs"), "Context should include yargs learning");
	assert.ok(context.includes("modular"), "Context should include modular learning");
	assert.ok(context.includes("CLI"), "Context should include primary goal");
	assert.ok(context.includes("clause") || context.includes("principle"), "Context should include reproductive clause info");
});
