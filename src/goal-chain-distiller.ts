import type {
	GoalChainDistillationInput,
	GoalChainDistillationResult,
	GoalChainDistiller,
} from "./goal-chain.js";
import type { TelosConfig } from "./config.js";

interface ChatCompletionResponse {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
}

function parseJsonObject(value: string): unknown {
	const trimmed = value.trim();
	try {
		return JSON.parse(trimmed);
	} catch {
		const match = trimmed.match(/\{[\s\S]*\}/);
		if (!match) throw new Error("Distiller response did not contain JSON");
		return JSON.parse(match[0]);
	}
}

function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, "");
}

/**
 * OpenAI-compatible chat-completion distiller.
 *
 * The backend can be LiteLLM, OpenAI-compatible local routing, or any future
 * equivalent endpoint with the same contract. It has no deterministic substitute:
 * failures are surfaced so mutation can be skipped explicitly.
 */
export class ChatCompletionGoalChainDistiller implements GoalChainDistiller {
	async distill(input: GoalChainDistillationInput, config: TelosConfig): Promise<GoalChainDistillationResult> {
		const distiller = config.goalChain.distiller;
		if (!distiller.enabled || distiller.provider !== "openai-compatible") {
			throw new Error("OpenAI-compatible distiller is not enabled");
		}
		if (!distiller.baseUrl) {
			throw new Error("TELOS_DISTILLER_BASE_URL or LITELLM_BASE_URL is required");
		}
		const apiKey = process.env[distiller.apiKeyEnvVar];
		if (!apiKey) {
			throw new Error(`${distiller.apiKeyEnvVar} is required for distillation`);
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), distiller.timeoutMs);
		try {
			const response = await fetch(`${normalizeBaseUrl(distiller.baseUrl)}/v1/chat/completions`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: distiller.model,
					temperature: 0.2,
					messages: [
						{
							role: "system",
							content: "You distill Telos goal-chain learnings into reproductive-clause principles. Return strict JSON only.",
						},
						{
							role: "user",
							content: JSON.stringify({
								instruction: "Return JSON with keys: principles (array of concise durable directives), reason (string), confidence (0..1). Preserve existing valid principles when still aligned; add only principles justified by fresh learnings and context summary.",
								primaryGoal: input.primaryGoal,
								existingPrinciples: input.reproductiveClause.essentialPrinciples,
								mutationGuidelines: input.reproductiveClause.mutationGuidelines,
								invariantConstraints: input.reproductiveClause.invariantConstraints,
								contextSummary: input.contextSummary,
								freshLearnings: input.freshLearnings,
								completedGoalCount: input.completedGoalCount,
								blockedGoalCount: input.blockedGoalCount,
								maxPrinciples: distiller.maxPrinciples,
							}),
						},
					],
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`Chat completion distiller HTTP ${response.status}`);
			}
			const data = await response.json() as ChatCompletionResponse;
			const content = data.choices?.[0]?.message?.content;
			if (!content) {
				throw new Error("Chat completion distiller returned no message content");
			}
			const parsed = parseJsonObject(content) as Record<string, unknown>;
			const principles = Array.isArray(parsed.principles)
				? parsed.principles.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
				: [];
			if (principles.length === 0) {
				throw new Error("Chat completion distiller returned no principles");
			}
			const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.7;
			return {
				principles,
				reason: typeof parsed.reason === "string" ? parsed.reason : "Chat completion distillation completed",
				confidence,
			};
		} finally {
			clearTimeout(timeout);
		}
	}
}
