import assert from "node:assert/strict";
import test from "node:test";
import { ChatCompletionGoalChainDistiller } from "../src/goal-chain-distiller.ts";
import { mergeTelosConfig } from "../src/config.ts";

function makeConfig(overrides = {}) {
	return mergeTelosConfig({
		goalChain: {
			distiller: {
				enabled: true,
				provider: "openai-compatible",
				model: "litellm/codex/gpt-5.4",
				baseUrl: "http://distiller.test",
				apiKeyEnvVar: "TEST_DISTILLER_KEY",
				timeoutMs: 1000,
				maxPrinciples: 4,
				...overrides,
			},
		},
	});
}

function makeInput() {
	return {
		chainId: "chain-1",
		primaryGoal: "Keep mutation aligned",
		reproductiveClause: {
			primaryGoal: "Keep mutation aligned",
			essentialPrinciples: ["Preserve intent"],
			invariantConstraints: [],
			mutationGuidelines: ["Mutate conservatively"],
			lifelineTimestamp: Date.now(),
			version: 1,
		},
		contextSummary: {
			generatedAt: Date.now(),
			generation: 1,
			sourceSubGoalCount: 2,
			sourceRecordCount: 3,
			completedSummary: "2 completed sub-goals",
			stableLearnings: ["Use explicit distillation"],
			recentLearnings: ["Avoid deterministic substitutes"],
			archivedSubGoalIds: [],
			metrics: {
				totalObjectiveChars: 10,
				totalRecordChars: 20,
				oversizedSubGoals: 0,
				inferredContextDumps: 0,
				rawRecordCount: 3,
				completedSubGoals: 2,
				needsCompaction: false,
			},
			curator: {
				enabled: false,
				provider: "none",
				host: "http://127.0.0.1:11434",
				model: "snowflake-arctic-embed2:latest",
				topK: 8,
				anchorFiles: ["ROADMAP.md"],
			},
		},
		freshLearnings: ["Avoid keyword mutation"],
		completedGoalCount: 2,
		blockedGoalCount: 0,
	};
}

test("ChatCompletionGoalChainDistiller requires configured base URL", async () => {
	const distiller = new ChatCompletionGoalChainDistiller();
	process.env.TEST_DISTILLER_KEY = "test-key";
	await assert.rejects(
		() => distiller.distill(makeInput(), makeConfig({ baseUrl: "" })),
		/BASE_URL|LITELLM_BASE_URL/,
	);
});

test("ChatCompletionGoalChainDistiller requires configured API key env var", async () => {
	const distiller = new ChatCompletionGoalChainDistiller();
	delete process.env.TEST_DISTILLER_KEY;
	await assert.rejects(
		() => distiller.distill(makeInput(), makeConfig()),
		/TEST_DISTILLER_KEY/,
	);
});

test("ChatCompletionGoalChainDistiller parses strict JSON response", async () => {
	const originalFetch = globalThis.fetch;
	process.env.TEST_DISTILLER_KEY = "test-key";
	globalThis.fetch = async (url, options) => {
		assert.equal(url, "http://distiller.test/v1/chat/completions");
		const body = JSON.parse(options.body);
		assert.equal(body.model, "litellm/codex/gpt-5.4");
		assert.equal(options.headers.authorization, "Bearer test-key");
		return {
			ok: true,
			async json() {
				return {
					choices: [{
						message: {
							content: JSON.stringify({
								principles: ["Preserve intent", "Use model-backed distillation"],
								reason: "Validated distillation",
								confidence: 0.91,
							}),
						},
					}],
				};
			},
		};
	};
	try {
		const result = await new ChatCompletionGoalChainDistiller().distill(makeInput(), makeConfig());
		assert.deepEqual(result.principles, ["Preserve intent", "Use model-backed distillation"]);
		assert.equal(result.reason, "Validated distillation");
		assert.equal(result.confidence, 0.91);
	} finally {
		globalThis.fetch = originalFetch;
		delete process.env.TEST_DISTILLER_KEY;
	}
});
