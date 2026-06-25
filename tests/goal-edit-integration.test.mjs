import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GoalManager } from "../src/goal-manager.ts";

// ===================== Integration: /goal edit and goal file round-trip =====================

test("goal edit round-trip: create → edit via file → verify new content", () => {
	const manager = new GoalManager();
	const goal = manager.createGoal("Initial objective");
	assert.equal(goal.objective, "Initial objective");

	// Simulate editing via file (what /goal edit does internally)
	const tempFile = join(tmpdir(), `telos-edit-integration-${Date.now()}.md`);
	writeFileSync(tempFile, "Edited objective via file");

	manager.loadGoalFromFile(tempFile);
	assert.equal(manager.getGoal().objective, "Edited objective via file");

	// Clean up
	unlinkSync(tempFile);
});

test("goal edit round-trip: large objective transparently stored in GOAL.md", () => {
	const manager = new GoalManager();

	// Create a goal with large objective (should auto-store in GOAL.md)
	const largeObj = "x".repeat(5000);
	const goal = manager.createGoal(largeObj);
	assert.ok(goal.objective.startsWith("file:"), "Large objective should use file reference");

	// Simulate editing via file with new large content
	const tempFile = join(tmpdir(), `telos-edit-large-${Date.now()}.md`);
	const newContent = "Updated large objective content".repeat(200);
	writeFileSync(tempFile, newContent);

	manager.loadGoalFromFile(tempFile);
	assert.ok(manager.getGoal().objective.startsWith("file:"), "Large edited content should also use file reference");

	// Verify transparent storage was used. GOAL.md is shared generated state in parallel tests.
	const goalFile = join(process.cwd(), "GOAL.md");
	assert.ok(existsSync(goalFile), "GOAL.md should be created for large content");

	// Clean up only the temp edit file; do not delete shared GOAL.md during parallel tests.
	unlinkSync(tempFile);
});

test("goal edit round-trip: small edit after large goal preserves transparency", () => {
	const manager = new GoalManager();

	// Create large goal
	const largeObj = "y".repeat(4100);
	const goal = manager.createGoal(largeObj);
	assert.ok(goal.objective.startsWith("file:"), "Large objective should use file reference");

	// Edit with small content (should revert to plain text)
	const tempFile = join(tmpdir(), `telos-small-edit-${Date.now()}.md`);
	writeFileSync(tempFile, "Small content");

	manager.loadGoalFromFile(tempFile);
	assert.equal(manager.getGoal().objective, "Small content", "Small content should be plain text");

	// Clean up only the temp edit file; do not delete shared GOAL.md during parallel tests.
	unlinkSync(tempFile);
});

test("goal edit round-trip: empty file is rejected", () => {
	const manager = new GoalManager();
	manager.createGoal("Some goal");

	const tempFile = join(tmpdir(), `telos-empty-${Date.now()}.md`);
	writeFileSync(tempFile, "");

	assert.throws(() => manager.loadGoalFromFile(tempFile), /empty/);

	// Goal should be unchanged
	assert.equal(manager.getGoal().objective, "Some goal");

	// Clean up
	unlinkSync(tempFile);
});

test("goal edit round-trip: full workflow preserves timestamps", () => {
	const manager = new GoalManager();
	const goal = manager.createGoal("Original");
	const originalCreatedAt = goal.createdAt;
	assert.ok(originalCreatedAt > 0);

	// Edit goal
	const tempFile = join(tmpdir(), `telos-timestamp-${Date.now()}.md`);
	writeFileSync(tempFile, "Edited goal content");
	manager.loadGoalFromFile(tempFile);

	const updatedGoal = manager.getGoal();
	assert.equal(updatedGoal.objective, "Edited goal content");
	assert.ok(updatedGoal.updatedAt >= originalCreatedAt, "updatedAt should be >= createdAt");

	// Clean up
	unlinkSync(tempFile);
});

test("goal edit round-trip: goal chain integration (create → edit → update status)", () => {
	// This is a minimal integration test showing edit works with goal chains
	const manager = new GoalManager();

	const goal = manager.createGoal("Chain integration test");
	assert.equal(manager.getGoal().status, "active");

	// Edit the objective
	const tempFile = join(tmpdir(), `telos-chain-edit-${Date.now()}.md`);
	writeFileSync(tempFile, "Refactored chain integration test");
	manager.loadGoalFromFile(tempFile);

	assert.equal(manager.getGoal().objective, "Refactored chain integration test");
	assert.equal(manager.getGoal().status, "active", "Status should remain active after edit");

	// Simulate completing the goal
	manager.updateGoalStatus("complete");
	assert.equal(manager.getGoal().status, "complete");

	// Clean up
	unlinkSync(tempFile);
});
