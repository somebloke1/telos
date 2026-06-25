/**
 * Telos configuration
 *
 * Centralizes runtime configuration so static values can migrate here over time
 * without tying feature code to environment variables or a specific storage
 * location. Environment variables are the first provider; future providers can
 * layer project files, Pi settings, or user profiles on top of this shape.
 */

export type GoalChainCuratorProvider = "none" | "ollama";
export type GoalChainDistillerProvider = "none" | "openai-compatible";

export interface GoalChainCuratorConfig {
	enabled: boolean;
	provider: GoalChainCuratorProvider;
	host: string;
	model: string;
	topK: number;
	timeoutMs: number;
	anchorFiles: string[];
}

export interface GoalChainDistillerConfig {
	enabled: boolean;
	provider: GoalChainDistillerProvider;
	model: string;
	baseUrl: string;
	apiKeyEnvVar: string;
	timeoutMs: number;
	maxPrinciples: number;
}

export interface GoalChainConfig {
	curator: GoalChainCuratorConfig;
	distiller: GoalChainDistillerConfig;
}

export interface TelosConfig {
	goalChain: GoalChainConfig;
}

export const DEFAULT_TELOS_CONFIG: TelosConfig = {
	goalChain: {
		curator: {
			enabled: false,
			provider: "none",
			host: "http://127.0.0.1:11434",
			model: "snowflake-arctic-embed2:latest",
			topK: 8,
			timeoutMs: 5000,
			anchorFiles: ["ROADMAP.md", "README.md"],
		},
		distiller: {
			enabled: false,
			provider: "none",
			model: "litellm/codex/gpt-5.4",
			baseUrl: "",
			apiKeyEnvVar: "OPENAI_API_KEY",
			timeoutMs: 30000,
			maxPrinciples: 8,
		},
	},
};

export type PartialTelosConfig = {
	goalChain?: {
		curator?: Partial<GoalChainCuratorConfig>;
		distiller?: Partial<GoalChainDistillerConfig>;
	};
};

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
	if (value === undefined) return defaultValue;
	return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parsePositiveIntegerEnv(value: string | undefined, defaultValue: number): number {
	const parsed = Number.parseInt(value || "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseCsvEnv(value: string | undefined, defaultValue: string[]): string[] {
	if (!value) return defaultValue;
	const parsed = value.split(",").map((item) => item.trim()).filter(Boolean);
	return parsed.length > 0 ? parsed : defaultValue;
}

function normalizeCuratorProvider(value: string | undefined, defaultValue: GoalChainCuratorProvider): GoalChainCuratorProvider {
	return value === "ollama" || value === "none" ? value : defaultValue;
}

function normalizeDistillerProvider(value: string | undefined, defaultValue: GoalChainDistillerProvider): GoalChainDistillerProvider {
	if (value === "litellm") return "openai-compatible";
	return value === "openai-compatible" || value === "none" ? value : defaultValue;
}

export function mergeTelosConfig(config?: PartialTelosConfig): TelosConfig {
	return {
		goalChain: {
			curator: {
				...DEFAULT_TELOS_CONFIG.goalChain.curator,
				...(config?.goalChain?.curator || {}),
			},
			distiller: {
				...DEFAULT_TELOS_CONFIG.goalChain.distiller,
				...(config?.goalChain?.distiller || {}),
			},
		},
	};
}

export function resolveTelosConfigFromEnv(
	env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): TelosConfig {
	const curatorDefaults = DEFAULT_TELOS_CONFIG.goalChain.curator;
	const curatorEnabled = parseBooleanEnv(env.TELOS_CURATOR_ENABLED, curatorDefaults.enabled);
	const curatorProvider = normalizeCuratorProvider(
		env.TELOS_CURATOR_PROVIDER || (curatorEnabled ? "ollama" : curatorDefaults.provider),
		curatorDefaults.provider,
	);
	const distillerDefaults = DEFAULT_TELOS_CONFIG.goalChain.distiller;
	const distillerEnabled = parseBooleanEnv(env.TELOS_DISTILLER_ENABLED, distillerDefaults.enabled);
	const distillerProvider = normalizeDistillerProvider(
		env.TELOS_DISTILLER_PROVIDER || (distillerEnabled ? "openai-compatible" : distillerDefaults.provider),
		distillerDefaults.provider,
	);

	return mergeTelosConfig({
		goalChain: {
			curator: {
				enabled: curatorEnabled,
				provider: curatorProvider,
				host: env.TELOS_CURATOR_HOST || curatorDefaults.host,
				model: env.TELOS_CURATOR_MODEL || curatorDefaults.model,
				topK: parsePositiveIntegerEnv(env.TELOS_CURATOR_TOP_K, curatorDefaults.topK),
				timeoutMs: parsePositiveIntegerEnv(env.TELOS_CURATOR_TIMEOUT_MS, curatorDefaults.timeoutMs),
				anchorFiles: parseCsvEnv(env.TELOS_CURATOR_ANCHOR_FILES, curatorDefaults.anchorFiles),
			},
			distiller: {
				enabled: distillerEnabled,
				provider: distillerProvider,
				model: env.TELOS_DISTILLER_MODEL || distillerDefaults.model,
				baseUrl: env.TELOS_DISTILLER_BASE_URL || env.LITELLM_BASE_URL || distillerDefaults.baseUrl,
				apiKeyEnvVar: env.TELOS_DISTILLER_API_KEY_ENV || distillerDefaults.apiKeyEnvVar,
				timeoutMs: parsePositiveIntegerEnv(env.TELOS_DISTILLER_TIMEOUT_MS, distillerDefaults.timeoutMs),
				maxPrinciples: parsePositiveIntegerEnv(env.TELOS_DISTILLER_MAX_PRINCIPLES, distillerDefaults.maxPrinciples),
			},
		},
	});
}
