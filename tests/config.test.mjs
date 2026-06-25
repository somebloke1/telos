import assert from "node:assert/strict";
import test from "node:test";
import {
	DEFAULT_TELOS_CONFIG,
	mergeTelosConfig,
	resolveTelosConfigFromEnv,
} from "../src/config.ts";
import { GoalChainManager } from "../src/goal-chain.ts";

test("Telos config defaults keep curator and distiller model locations abstract", () => {
	const config = resolveTelosConfigFromEnv({});
	assert.equal(config.goalChain.curator.enabled, false);
	assert.equal(config.goalChain.curator.provider, "none");
	assert.equal(config.goalChain.curator.host, "http://127.0.0.1:11434");
	assert.equal(config.goalChain.curator.model, "snowflake-arctic-embed2:latest");
	assert.deepEqual(config.goalChain.curator.anchorFiles, ["ROADMAP.md", "README.md"]);
	assert.equal(config.goalChain.distiller.enabled, false);
	assert.equal(config.goalChain.distiller.provider, "none");
	assert.equal(config.goalChain.distiller.model, "litellm/codex/gpt-5.4");
	assert.equal(config.goalChain.distiller.apiKeyEnvVar, "OPENAI_API_KEY");
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

test("Telos config rejects unknown providers safely", () => {
	const config = resolveTelosConfigFromEnv({
		TELOS_CURATOR_ENABLED: "true",
		TELOS_CURATOR_PROVIDER: "unknown",
		TELOS_DISTILLER_ENABLED: "true",
		TELOS_DISTILLER_PROVIDER: "unknown",
	});
	assert.equal(config.goalChain.curator.provider, DEFAULT_TELOS_CONFIG.goalChain.curator.provider);
	assert.equal(config.goalChain.distiller.provider, DEFAULT_TELOS_CONFIG.goalChain.distiller.provider);
});

test("Telos config resolves provider-neutral distiller settings from environment", () => {
	const config = resolveTelosConfigFromEnv({
		TELOS_DISTILLER_ENABLED: "true",
		TELOS_DISTILLER_PROVIDER: "openai-compatible",
		TELOS_DISTILLER_MODEL: "litellm/codex/gpt-5.4-mini",
		TELOS_DISTILLER_BASE_URL: "http://localhost:4000",
		TELOS_DISTILLER_API_KEY_ENV: "TEST_LITELLM_KEY",
		TELOS_DISTILLER_TIMEOUT_MS: "12000",
		TELOS_DISTILLER_MAX_PRINCIPLES: "5",
	});
	assert.equal(config.goalChain.distiller.enabled, true);
	assert.equal(config.goalChain.distiller.provider, "openai-compatible");
	assert.equal(config.goalChain.distiller.model, "litellm/codex/gpt-5.4-mini");
	assert.equal(config.goalChain.distiller.baseUrl, "http://localhost:4000");
	assert.equal(config.goalChain.distiller.apiKeyEnvVar, "TEST_LITELLM_KEY");
	assert.equal(config.goalChain.distiller.timeoutMs, 12000);
	assert.equal(config.goalChain.distiller.maxPrinciples, 5);
});

test("Telos config maps legacy litellm distiller provider to openai-compatible", () => {
	const config = resolveTelosConfigFromEnv({
		TELOS_DISTILLER_ENABLED: "true",
		TELOS_DISTILLER_PROVIDER: "litellm",
	});
	assert.equal(config.goalChain.distiller.provider, "openai-compatible");
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
