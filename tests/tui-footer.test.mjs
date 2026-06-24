import assert from "node:assert/strict";
import test from "node:test";
import { GoalChainManager } from "../src/goal-chain.js";
import { truncate, formatSubGoalProgress, formatEvolutionInfo, renderChainWidget, STATUS_CODES, CHAIN_STATUS_CODES, EVOLUTION_SYMBOLS, COLORS, colorize, colorizeStatus, colorizeChainStatus, getStatusColor, STATUS_COLORS, CHAIN_STATUS_COLORS } from "../src/tui/footer.js";

// ===================== truncate tests =====================

test("truncate preserves short text", () => {
	assert.equal(truncate("hello", 10), "hello");
	assert.equal(truncate("hello world", 20), "hello world");
});

test("truncate collapses whitespace", () => {
	// "hello   world" -> "hello world" (11 chars) truncated at 10
	assert.equal(truncate("hello   world", 10), "hello wor…");
	// "  spaces  around  " -> "spaces around" (15 chars) truncated at 10
	assert.equal(truncate("  spaces  around  ", 10), "spaces ar…");
});

test("truncate trims whitespace", () => {
	assert.equal(truncate("  trimmed  ", 10), "trimmed");
});

test("truncate with ellipsis adds … at maxLen-1", () => {
	const result = truncate("hello world test", 8);
	assert.equal(result.length, 8);
	assert.equal(result[result.length - 1], "…");
	assert.equal(result, "hello w…");
});

test("truncate exact length no ellipsis", () => {
	assert.equal(truncate("exact", 5), "exact");
});

// ===================== STATUS_CODES tests =====================

test("STATUS_CODES maps all goal statuses", () => {
	assert.equal(STATUS_CODES.active, "A");
	assert.equal(STATUS_CODES.paused, "P");
	assert.equal(STATUS_CODES.blocked, "B");
	assert.equal(STATUS_CODES.complete, "✓");
	assert.equal(STATUS_CODES.budget_limited, "⌀");
});

test("STATUS_CODES has no unknown mappings", () => {
	assert.equal(STATUS_CODES.unknown, undefined);
});

// ===================== CHAIN_STATUS_CODES tests =====================

test("CHAIN_STATUS_CODES maps all chain statuses", () => {
	assert.equal(CHAIN_STATUS_CODES.active, "⚡");
	assert.equal(CHAIN_STATUS_CODES.paused, "⏸");
	assert.equal(CHAIN_STATUS_CODES.complete, "✓");
	assert.equal(CHAIN_STATUS_CODES.evolving, "⟳");
});

test("CHAIN_STATUS_CODES has no unknown mappings", () => {
	assert.equal(CHAIN_STATUS_CODES.unknown, undefined);
});

// ===================== formatSubGoalProgress tests =====================

test("formatSubGoalProgress returns 'no sub-goals' for empty chain", () => {
	assert.equal(formatSubGoalProgress({ subGoals: [] }), "no sub-goals");
});

test("formatSubGoalProgress shows 'N pending' for all pending", () => {
	const chain = { subGoals: [{ status: "pending" }, { status: "pending" }, { status: "pending" }] };
	assert.equal(formatSubGoalProgress(chain), "3 pending");
});

test("formatSubGoalProgress shows 'N/M done' for mixed states", () => {
	const chain = {
		subGoals: [
			{ status: "complete" },
			{ status: "complete" },
			{ status: "pending" },
			{ status: "pending" },
			{ status: "pending" },
		],
	};
	assert.equal(formatSubGoalProgress(chain), "2/5 done");
});

test("formatSubGoalProgress shows multiple indicators", () => {
	const chain = {
		subGoals: [
			{ status: "complete" },
			{ status: "complete" },
			{ status: "active" },
			{ status: "active" },
			{ status: "blocked" },
		],
	};
	const result = formatSubGoalProgress(chain);
	assert.match(result, /2\/5 done/);
	assert.match(result, /2 active/);
	assert.match(result, /1 blocked/);
});

test("formatSubGoalProgress handles single active sub-goal", () => {
	const chain = { subGoals: [{ status: "active" }] };
	assert.equal(formatSubGoalProgress(chain), "1 active");
});

test("formatSubGoalProgress handles single blocked sub-goal", () => {
	const chain = { subGoals: [{ status: "blocked" }] };
	assert.equal(formatSubGoalProgress(chain), "1 blocked");
});

// ===================== formatEvolutionInfo Tests =====================

test("formatEvolutionInfo returns empty for fresh chain", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Test", undefined, ["Step"]);
	assert.equal(formatEvolutionInfo(chain), "", "Fresh chain should have empty evolution info");
});

test("formatEvolutionInfo shows clause version after mutation", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Test", undefined, ["A", "B", "C"]);
	manager.updateSubGoalStatus(chain.id, "1", "complete", ["First learning"]);
	manager.updateSubGoalStatus(chain.id, "2", "complete", ["Second learning"]);

	// Complete third to trigger evolution
	manager.updateSubGoalStatus(chain.id, "3", "complete", ["Third learning"]);

	const evolution = formatEvolutionInfo(chain);
	assert.ok(
		evolution.includes(EVOLUTION_SYMBOLS.version) || evolution.includes(EVOLUTION_SYMBOLS.generation),
		`Should show version or generation after mutation, got: ${evolution}`,
	);
});

test("formatEvolutionInfo shows generation after mutation", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Evolution test", undefined, ["A", "B", "C"]);

	// Complete first two with learnings to trigger evolution
	manager.updateSubGoalStatus(chain.id, "1", "complete", ["First learning"]);
	manager.updateSubGoalStatus(chain.id, "2", "complete", ["Second learning"]);

	// Complete third to trigger another evolution
	manager.updateSubGoalStatus(chain.id, "3", "complete", ["Third learning"]);

	const evolution = formatEvolutionInfo(chain);
	assert.ok(
		evolution.includes(EVOLUTION_SYMBOLS.version) || evolution.includes(EVOLUTION_SYMBOLS.generation),
		`Evolution info should show evolution symbols, got: ${evolution}`,
	);
});

test("formatEvolutionInfo shows learnings count", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Learnings test", undefined, ["A", "B"]);

	manager.updateSubGoalStatus(chain.id, "1", "complete", [
		"Learning one",
		"Learning two",
	]);
	manager.updateSubGoalStatus(chain.id, "2", "complete", [
		"Learning three",
	]);

	const evolution = formatEvolutionInfo(chain);
	assert.ok(evolution.includes(EVOLUTION_SYMBOLS.learnings), "Should show learnings symbol");
	// 3 unique learnings
	assert.ok(evolution.includes("3"), "Should show count of 3 learnings");
});

// ===================== renderChainWidget Tests =====================

test("renderChainWidget with no context is no-op", () => {
	const manager = new GoalChainManager();
	renderChainWidget(undefined, manager);
	// Should not throw
});

test("renderChainWidget with no manager is no-op", () => {
	renderChainWidget({ ui: { setStatus: () => {} } });
	// Should not throw
});

test("renderChainWidget with no chains sets undefined", () => {
	const manager = new GoalChainManager();
	let received = undefined;
	renderChainWidget(
		{ ui: { setStatus: (key, value) => { received = { key, value }; } } },
		manager,
	);
	assert.equal(received?.key, "telos-chain-widget");
	assert.equal(received?.value, undefined);
});

test("renderChainWidget renders chain info with sub-goals", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Develop a modular system", undefined, [
		"Design architecture",
		"Implement core",
	]);

	manager.updateSubGoalStatus(chain.id, "1", "complete", [
		"Use dependency injection",
	]);
	manager.updateSubGoalStatus(chain.id, "2", "active");

	let received = undefined;
	renderChainWidget(
		{ ui: { setStatus: (key, value) => { received = { key, value }; } } },
		manager,
	);

	assert.equal(received?.key, "telos-chain-widget");
	assert.ok(received?.value, "Should have rendered value");
	assert.ok(received.value.includes("Develop a modular system"), "Should include primary goal");
	assert.ok(received.value.includes("1/2 done"), "Should include progress");
	assert.ok(received.value.includes("1 active"), "Should include active count");
});

test("renderChainWidget includes learnings preview", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Test learnings", undefined, [
		"Step 1",
		"Step 2",
	]);

	manager.updateSubGoalStatus(chain.id, "1", "complete", [
		"Learning one about the system",
		"Learning two about modules",
	]);
	manager.updateSubGoalStatus(chain.id, "2", "complete", [
		"Learning three about testing",
	]);

	let received = undefined;
	renderChainWidget(
		{ ui: { setStatus: (key, value) => { received = { key, value }; } } },
		manager,
	);

	assert.ok(received?.value, "Should have rendered value");
	assert.ok(received.value.includes("ℒ:"), "Should include learnings preview");
	assert.ok(received.value.includes("Learning one"), "Should include first learning");
});

test("renderChainWidget shows actionable sub-goals", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Test actions", undefined, [
		"Build frontend",
		"Build backend",
	]);

	manager.updateSubGoalStatus(chain.id, "1", "active");
	// "2" remains pending

	let received = undefined;
	renderChainWidget(
		{ ui: { setStatus: (key, value) => { received = { key, value }; } } },
		manager,
	);

	assert.ok(received?.value, "Should have rendered value");
	assert.ok(received.value.includes("Build frontend"), "Should show actionable sub-goal");
	assert.ok(received.value.includes("Build backend"), "Should show pending sub-goal");
});

test("renderChainWidget truncates long objectives", () => {
	const manager = new GoalChainManager();
	const chain = manager.createGoalChain("Develop a very long primary goal that should be truncated in the widget display", undefined, [
		"Design and implement a comprehensive architecture for the system that covers all aspects",
	]);

	manager.updateSubGoalStatus(chain.id, "1", "complete", [
		"This is a very long learning message that should also be truncated when displayed in the chain widget",
	]);

	let received = undefined;
	renderChainWidget(
		{ ui: { setStatus: (key, value) => { received = { key, value }; } } },
		manager,
	);

	assert.ok(received?.value, "Should have rendered value");
	// Primary goal should be truncated (max 40 chars)
	const primaryLine = received.value.split("\n")[0];
	assert.ok(primaryLine.length <= 42, "Primary goal line should be truncated");
	// Learning should be truncated (max 40 chars)
	assert.ok(received.value.includes("ℒ:"), "Should have learnings section");
});

// ===================== Colorization Tests =====================

test("COLORS has all expected ANSI codes", () => {
	assert.ok(COLORS.reset.startsWith("\x1b"));
	assert.ok(COLORS.green.startsWith("\x1b"));
	assert.ok(COLORS.yellow.startsWith("\x1b"));
	assert.ok(COLORS.red.startsWith("\x1b"));
	assert.ok(COLORS.cyan.startsWith("\x1b"));
});

test("colorize wraps text with ANSI codes", () => {
	const result = colorize("hello", COLORS.green);
	assert.ok(result.startsWith("\x1b[32m"), "Should start with green ANSI code");
	assert.ok(result.endsWith("\x1b[0m"), "Should end with reset ANSI code");
	assert.ok(result.includes("hello"), "Should contain original text");
});

test("colorizeStatus applies correct color for active", () => {
	const result = colorizeStatus("A", "active", STATUS_COLORS);
	assert.ok(result.includes("\x1b[32m"), "Active should be green");
	assert.ok(result.includes("[A]"), "Should contain status code");
});

test("colorizeStatus applies correct color for blocked", () => {
	const result = colorizeStatus("B", "blocked", STATUS_COLORS);
	assert.ok(result.includes("\x1b[31m"), "Blocked should be red");
});

test("colorizeStatus applies correct color for complete", () => {
	const result = colorizeStatus("✓", "complete", STATUS_COLORS);
	assert.ok(result.includes("\x1b[90m"), "Complete should be gray");
});

test("colorizeChainStatus applies correct color for active", () => {
	const result = colorizeChainStatus("⚡", "active");
	assert.ok(result.includes("\x1b[32m"), "Active chain should be green");
});

test("colorizeChainStatus applies correct color for evolving", () => {
	const result = colorizeChainStatus("⟳", "evolving");
	assert.ok(result.includes("\x1b[36m"), "Evolving chain should be cyan");
});

test("getStatusColor falls back to bright for unknown status", () => {
	const result = getStatusColor("unknown", STATUS_COLORS);
	assert.equal(result, COLORS.bright, "Unknown status should use bright color");
});

test("STATUS_COLORS maps all goal statuses", () => {
	assert.equal(STATUS_COLORS.active, COLORS.green);
	assert.equal(STATUS_COLORS.paused, COLORS.yellow);
	assert.equal(STATUS_COLORS.blocked, COLORS.red);
	assert.equal(STATUS_COLORS.complete, COLORS.gray);
	assert.equal(STATUS_COLORS.budget_limited, COLORS.cyan);
});

test("CHAIN_STATUS_COLORS maps all chain statuses", () => {
	assert.equal(CHAIN_STATUS_COLORS.active, COLORS.green);
	assert.equal(CHAIN_STATUS_COLORS.paused, COLORS.yellow);
	assert.equal(CHAIN_STATUS_COLORS.complete, COLORS.gray);
	assert.equal(CHAIN_STATUS_COLORS.evolving, COLORS.cyan);
});
