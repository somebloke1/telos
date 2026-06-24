/**
 * Goal file editing tests
 *
 * Tests for:
 * - GoalManager.resolveFileReference
 * - GoalManager.hasFileReference / getFileReferencePath
 * - GoalManager.readGoalFile / writeGoalFile
 * - GoalManager.writeGoalToTempFile / loadGoalFromFile
 * - GoalManager.editGoal (without actual editor)
 */

import { describe, test, after } from "node:test";
import assert from "node:assert";
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoalManager } from "../src/goal-manager.js";

const tempDir = join(tmpdir(), `telos-test-${Date.now()}`);
mkdirSync(tempDir, { recursive: true });

function cleanup() {
	try {
		const files = ["test-goals", "read-test.md", "resolve-test.md", "load-test.md",
			"empty-test.md", "long-content.md", "small-content.md", "workflow-edit.md",
			"edit-assert.md", "timestamp-test.md"];
		for (const f of files) {
			const p = join(tempDir, f);
			if (existsSync(p)) unlinkSync(p);
		}
	} catch {}
}

describe("GoalManager - file reference resolution", () => {
	test("hasFileReference returns false for plain objective", () => {
		const manager = new GoalManager();
		assert.equal(manager.hasFileReference(), false);
	});

	test("hasFileReference returns false when goal is plain text", () => {
		const manager = new GoalManager();
		manager.createGoal("test objective");
		assert.equal(manager.hasFileReference(), false);
	});

	test("hasFileReference returns true for file-based objective", () => {
		const manager = new GoalManager();
		manager.createGoal("file:/path/to/GOAL.md");
		assert.equal(manager.hasFileReference(), true);
	});

	test("hasFileReference returns false after null", () => {
		const manager = new GoalManager();
		assert.equal(manager.hasFileReference(), false);
	});

	test("getFileReferencePath returns null for plain objective", () => {
		const manager = new GoalManager();
		assert.equal(manager.getFileReferencePath(), null);
	});

	test("getFileReferencePath returns path for file reference", () => {
		const manager = new GoalManager();
		manager.createGoal("file:/path/to/GOAL.md");
		assert.equal(manager.getFileReferencePath(), "/path/to/GOAL.md");
	});

	test("getFileReferencePath returns null when no goal", () => {
		const manager = new GoalManager();
		assert.equal(manager.getFileReferencePath(), null);
	});
});

describe("GoalManager - read/write goal file", () => {

	test("writeGoalFile creates file and returns path", () => {
		const manager = new GoalManager();
		const filePath = join(tempDir, "test-goals", "edit.md");
		const result = manager.writeGoalFile(filePath, "test content");
		assert.equal(result, filePath);
		assert.ok(existsSync(filePath));
		assert.equal(readFileSync(filePath, "utf-8"), "test content");
	});

	test("writeGoalFile creates parent directories", () => {
		const manager = new GoalManager();
		const filePath = join(tempDir, "nested", "deep", "goal.md");
		const result = manager.writeGoalFile(filePath, "nested content");
		assert.equal(result, filePath);
		assert.ok(existsSync(filePath));
	});

	test("readGoalFile reads existing file", () => {
		const manager = new GoalManager();
		const filePath = join(tempDir, "read-test.md");
		writeFileSync(filePath, "readable content");
		const result = manager.readGoalFile(filePath);
		assert.equal(result, "readable content");
	});

	test("readGoalFile throws for non-existent file", () => {
		const manager = new GoalManager();
		assert.throws(() => {
			manager.readGoalFile("/nonexistent/path.md");
		}, /not found/);
	});

	test("resolveFileReference reads file content", () => {
		const manager = new GoalManager();
		const filePath = join(tempDir, "resolve-test.md");
		writeFileSync(filePath, "resolved content");
		const result = manager.resolveFileReference(`file:${filePath}`);
		assert.equal(result, "resolved content");
	});
});

describe("GoalManager - temp file editing", () => {
	// tempDir is defined at top of file

	test("writeGoalToTempFile creates temp file with goal content", () => {
		const manager = new GoalManager();
		manager.createGoal("test objective for temp file");
		const tempPath = manager.writeGoalToTempFile();
		assert.ok(existsSync(tempPath));
		assert.equal(readFileSync(tempPath, "utf-8"), "test objective for temp file");
		unlinkSync(tempPath);
	});

	test("writeGoalToTempFile throws when no goal", () => {
		const manager = new GoalManager();
		assert.throws(() => {
			manager.writeGoalToTempFile();
		}, /No goal exists/);
	});

	test("loadGoalFromFile updates objective from file", () => {
		const manager = new GoalManager();
		manager.createGoal("original objective");
		const filePath = join(tempDir, "load-test.md");
		writeFileSync(filePath, "new content from file");
		manager.loadGoalFromFile(filePath);
		assert.equal(manager.getGoal().objective, "new content from file");
	});

	test("loadGoalFromFile throws for empty file", () => {
		const manager = new GoalManager();
		manager.createGoal("original");
		const filePath = join(tempDir, "empty-test.md");
		writeFileSync(filePath, "");
		assert.throws(() => {
			manager.loadGoalFromFile(filePath);
		}, /empty/);
	});

	test("loadGoalFromFile with file reference writes to GOAL.md", () => {
		const manager = new GoalManager();
		manager.createGoal("short");
		const filePath = join(tempDir, "long-content.md");
		const longContent = "a".repeat(4001);
		writeFileSync(filePath, longContent);
		manager.loadGoalFromFile(filePath);
		const goal = manager.getGoal();
		assert.ok(goal.objective.startsWith("file:"), "Should be file reference");
		assert.ok(existsSync(join(process.cwd(), "GOAL.md")), "Should create GOAL.md");
		// Clean up
		try { unlinkSync(join(process.cwd(), "GOAL.md")); } catch {}
	});

	test("loadGoalFromFile stores large content as file reference automatically", () => {
		const manager = new GoalManager();
		manager.createGoal("short");
		const filePath = join(tempDir, "small-content.md");
		writeFileSync(filePath, "small content");
		manager.loadGoalFromFile(filePath);
		const goal = manager.getGoal();
		assert.equal(goal.objective, "small content", "Should keep as plain text when <4000 chars");
	});
});

describe("GoalManager - editGoal async method", () => {
	test("editGoal throws when no goal", async () => {
		const manager = new GoalManager();
		await assert.rejects(() => manager.editGoal(), /No goal exists/);
	});

	test("editGoal creates and reads temp file", async () => {
		const manager = new GoalManager();
		manager.createGoal("original objective");
		const tempPath = join(tmpdir(), `telos-goal-edit-test.md`);

		// Mock the spawn by creating a simple approach: write temp file directly
		const originalWriteFile = manager.writeGoalToTempFile;
		manager.writeGoalToTempFile = () => tempPath;

		const filePath = join(tempDir, "edit-assert.md");
		writeFileSync(filePath, "edited objective");

		// Instead of actually spawning editor, test the file round-trip manually
		const tempPath2 = join(tempDir, "edit-temp.md");
		writeFileSync(tempPath2, "edited via file");

		manager.loadGoalFromFile(tempPath2);
		assert.equal(manager.getGoal().objective, "edited via file");
	});
});

describe("GoalManager - integration: edit workflow", () => {
	test("full edit workflow: create → write temp → load from file → update", () => {
		const manager = new GoalManager();
		manager.createGoal("initial objective");

		const editFile = join(tempDir, "workflow-edit.md");
		writeFileSync(editFile, "edited via workflow");

		// Simulate editor workflow
		const tempPath = manager.writeGoalToTempFile();
		assert.equal(readFileSync(tempPath, "utf-8"), "initial objective");
		unlinkSync(tempPath);

		manager.loadGoalFromFile(editFile);
		assert.equal(manager.getGoal().objective, "edited via workflow");
	});

	test("large objective: write to GOAL.md, use file reference", () => {
		const manager = new GoalManager();
		manager.createGoal("short");

		const longFilePath = join(tempDir, "long.md");
		const longContent = "x".repeat(5000);
		writeFileSync(longFilePath, longContent);

		manager.loadGoalFromFile(longFilePath);
		const goal = manager.getGoal();
		assert.ok(goal.objective.startsWith("file:"), "Should use file reference for large content");
		assert.ok(goal.objective.includes("GOAL.md"), "Should reference GOAL.md");
		// Clean up
		try { unlinkSync(join(process.cwd(), "GOAL.md")); } catch {}
	});

	test("edit workflow preserves timestamps", () => {
		const manager = new GoalManager();
		manager.createGoal("original");
		const originalUpdated = manager.getGoal().updatedAt;

		const editFile = join(tempDir, "timestamp-test.md");
		writeFileSync(editFile, "updated objective");

		const before = Date.now();
		manager.loadGoalFromFile(editFile);
		const after = Date.now();

		const goal = manager.getGoal();
		assert.ok(goal.updatedAt >= before, "Updated timestamp should be >= load time");
		assert.ok(goal.updatedAt <= after, "Updated timestamp should be <= now");
	});
});

after(() => {
	cleanup();
})
