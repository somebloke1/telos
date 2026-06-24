import assert from "node:assert/strict";
import test from "node:test";
import { truncate, formatSubGoalProgress, STATUS_CODES, CHAIN_STATUS_CODES } from "../src/tui/footer.js";

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
