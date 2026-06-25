/**
 * Telos configuration
 *
 * Centralizes runtime configuration so static values can migrate here over time
 * without tying feature code to environment variables or a specific storage
 * location. Environment variables are the first provider; future providers can
 * layer project files, Pi settings, or user profiles on top of this shape.
 */

export type GoalChainCuratorProvider = "none" | "ollama";

export interface GoalChainCuratorConfig {
	enabled: boolean;
	provider: GoalChainCuratorProvider;
	host: string;
	model: string;
	topK: number;
	timeoutMs: number;
	anchorFiles: string[];
}

export interface GoalChainConfig {
	curator: GoalChainCuratorConfig;
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
	},
};

export type PartialTelosConfig = {
	goalChain?: {
		curator?: Partial<GoalChainCuratorConfig>;
	};
};

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined) return fallback;
	return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parsePositiveIntegerEnv(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value || "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCsvEnv(value: string | undefined, fallback: string[]): string[] {
	if (!value) return fallback;
	const parsed = value.split(",").map((item) => item.trim()).filter(Boolean);
	return parsed.length > 0 ? parsed : fallback;
}

function normalizeCuratorProvider(value: string | undefined, fallback: GoalChainCuratorProvider): GoalChainCuratorProvider {
	return value === "ollama" || value === "none" ? value : fallback;
}

export function mergeTelosConfig(config?: PartialTelosConfig): TelosConfig {
	return {
		goalChain: {
			curator: {
				...DEFAULT_TELOS_CONFIG.goalChain.curator,
				...(config?.goalChain?.curator || {}),
			},
		},
	};
}

export function resolveTelosConfigFromEnv(
	env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): TelosConfig {
	const defaults = DEFAULT_TELOS_CONFIG.goalChain.curator;
	const enabled = parseBooleanEnv(env.TELOS_CURATOR_ENABLED, defaults.enabled);
	const provider = normalizeCuratorProvider(
		env.TELOS_CURATOR_PROVIDER || (enabled ? "ollama" : defaults.provider),
		defaults.provider,
	);

	return mergeTelosConfig({
		goalChain: {
			curator: {
				enabled,
				provider,
				host: env.TELOS_CURATOR_HOST || defaults.host,
				model: env.TELOS_CURATOR_MODEL || defaults.model,
				topK: parsePositiveIntegerEnv(env.TELOS_CURATOR_TOP_K, defaults.topK),
				timeoutMs: parsePositiveIntegerEnv(env.TELOS_CURATOR_TIMEOUT_MS, defaults.timeoutMs),
				anchorFiles: parseCsvEnv(env.TELOS_CURATOR_ANCHOR_FILES, defaults.anchorFiles),
			},
		},
	});
}
