import assert from "node:assert/strict";
import test from "node:test";
import {
	DEFAULT_TELOS_CONFIG,
	mergeTelosConfig,
	resolveTelosConfigFromEnv,
} from "../src/config.ts";
import { GoalChainManager } from "../src/goal-chain.ts";

test("Telos config defaults keep curator disabled and model location abstract", () => {
	const config = resolveTelosConfigFromEnv({});
	assert.equal(config.goalChain.curator.enabled, false);
	assert.equal(config.goalChain.curator.provider, "none");
	assert.equal(config.goalChain.curator.host, "http://127.0.0.1:11434");
	assert.equal(config.goalChain.curator.model, "snowflake-arctic-embed2:latest");
	assert.deepEqual(config.goalChain.curator.anchorFiles, ["ROADMAP.md", "README.md"]);
});

test("Telos config resolves curator settings from environment", () => {
	const config = resolveTelosConfigFromEnv({
		TELOS_CURATOR_ENABLED: "true",
		TELOS_CURATOR_PROVIDER: "ollama",
		TELOS_CURATOR_HOST: "http://localhost:11434",
		TELOS_CURATOR_MODEL: "local-embedder:latest",
		TELOS_CURATOR_TOP_K: "12",
		TELOS_CURATOR_TIMEOUT_MS: "9000",
		TELOS_CURATOR_ANCHOR_FILES: "ROADMAP.md,docs/design.md",
	});
	assert.equal(config.goalChain.curator.enabled, true);
	assert.equal(config.goalChain.curator.provider, "ollama");
	assert.equal(config.goalChain.curator.host, "http://localhost:11434");
	assert.equal(config.goalChain.curator.model, "local-embedder:latest");
	assert.equal(config.goalChain.curator.topK, 12);
	assert.equal(config.goalChain.curator.timeoutMs, 9000);
	assert.deepEqual(config.goalChain.curator.anchorFiles, ["ROADMAP.md", "docs/design.md"]);
});

test("Telos config rejects unknown curator providers safely", () => {
	const config = resolveTelosConfigFromEnv({
		TELOS_CURATOR_ENABLED: "true",
		TELOS_CURATOR_PROVIDER: "unknown",
	});
	assert.equal(config.goalChain.curator.provider, DEFAULT_TELOS_CONFIG.goalChain.curator.provider);
});

test("GoalChainManager stores curator config in compaction summary", () => {
	const config = mergeTelosConfig({
		goalChain: {
			curator: {
				enabled: true,
				provider: "ollama",
				host: "http://example.test:11434",
				model: "snowflake-arctic-embed2:latest",
				topK: 5,
				anchorFiles: ["ROADMAP.md"],
			},
		},
	});
	const manager = new GoalChainManager(config);
	const chain = manager.createGoalChain("Configured compaction", undefined, ["Task"]);
	manager.updateSubGoalStatus(chain.id, "1", "complete", ["A stable learning"]);
	const summary = manager.compactGoalChain(chain.id);
	assert.equal(summary.curator.enabled, true);
	assert.equal(summary.curator.provider, "ollama");
	assert.equal(summary.curator.host, "http://example.test:11434");
	assert.equal(summary.curator.model, "snowflake-arctic-embed2:latest");
	assert.equal(summary.curator.topK, 5);
	assert.deepEqual(summary.curator.anchorFiles, ["ROADMAP.md"]);
});
