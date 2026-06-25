/**
 * Goal Chain Management
 *
 * Implements hierarchical, evolutionary goal chains with:
 * - Primary goals with reproductive clauses
 * - Sub-goals that serve the primary goal
 * - Conservative mutation across generations
 * - Deterministic caching for reproductive clauses
 * - Sub-goal inference from record space
 */

import {
	mergeTelosConfig,
	type GoalChainCuratorProvider,
	type TelosConfig,
	type PartialTelosConfig,
} from "./config.js";

export interface GoalChainDistillationInput {
	chainId: string;
	primaryGoal: string;
	reproductiveClause: ReproductiveClause;
	contextSummary: GoalChainContextSummary;
	freshLearnings: string[];
	completedGoalCount: number;
	blockedGoalCount: number;
}

export interface GoalChainDistillationResult {
	principles: string[];
	reason: string;
	confidence: number;
}

export interface GoalChainDistiller {
	distill(input: GoalChainDistillationInput, config: TelosConfig): Promise<GoalChainDistillationResult>;
}

export interface ReproductiveClause {
	primaryGoal: string;
	essentialPrinciples: string[];
	invariantConstraints: string[];
	mutationGuidelines: string[];
	lifelineTimestamp: number;
	version: number;
}

export interface SubGoal {
	id: string;
	objective: string;
	status: "pending" | "active" | "complete" | "blocked";
	parentGoalId?: string;
	generation: number;
	inferredFromRecord?: boolean;
	tokenBudget?: number;
	tokensUsed: number;
	createdAt: number;
	completedAt?: number;
}

export interface GoalChainContextMetrics {
	totalObjectiveChars: number;
	totalRecordChars: number;
	oversizedSubGoals: number;
	inferredContextDumps: number;
	rawRecordCount: number;
	completedSubGoals: number;
	needsCompaction: boolean;
}

export interface GoalChainContextSummary {
	generatedAt: number;
	generation: number;
	sourceSubGoalCount: number;
	sourceRecordCount: number;
	completedSummary: string;
	stableLearnings: string[];
	recentLearnings: string[];
	archivedSubGoalIds: string[];
	metrics: GoalChainContextMetrics;
	curator: {
		enabled: boolean;
		provider: GoalChainCuratorProvider;
		host: string;
		model: string;
		topK: number;
		anchorFiles: string[];
	};
}

export interface GoalChain {
	id: string;
	primaryGoal: string;
	reproductiveClause: ReproductiveClause;
	subGoals: SubGoal[];
	contextSummary?: GoalChainContextSummary;
	currentGeneration: number;
	totalGenerations: number;
	recordSpace: RecordSpaceEntry[];
	status: "active" | "paused" | "complete" | "evolving";
	createdAt: number;
	lastMutationAt: number;
}

export interface RecordSpaceEntry {
	type: "goal_created" | "goal_updated" | "goal_completed" | "goal_blocked" | "goal_mutated" | "inference" | "distillation_skipped";
	goalId: string;
	timestamp: number;
	details: string;
	success?: boolean;
	learnings?: string[];
}

export interface GoalChainMutation {
	previousClause: ReproductiveClause;
	newClause: ReproductiveClause;
	mutationReason: string;
	confidence: number;
	timestamp: number;
}

export interface GoalChainPersistenceEntry {
	schemaVersion: number;
	chainIdCounter: number;
	subGoalIdCounter: number;
	chains: GoalChain[];
}

/** Session validation result for diagnostics. */
export interface SessionValidationResult {
	valid: boolean;
	version: number | null;
	chainCount: number;
	skippedChains: string[];
	warnings: string[];
}

/** Minimum supported schema version. */
const MIN_SCHEMA_VERSION = 1;

/** Truncate text for display with ellipsis. */
function truncateForDisplay(value: string, maxLength: number): string {
	const cleaned = value.trim().replace(/\s+/g, " ");
	return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

/**
 * GoalChainManager manages evolutionary goal chains
 */
export class GoalChainManager {
	private static readonly SCHEMA_VERSION = 1;
	private static readonly COMPLETED_SUB_GOAL_FULL_DISPLAY_LIMIT = 3;
	private static readonly COMPLETED_SUB_GOAL_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
	private static readonly SUB_GOAL_SUMMARY_CHARS = 180;
	private static readonly ACTIVE_SUB_GOAL_DETAIL_CHARS = 1200;
	private static readonly INFERENCE_CONTEXT_CHARS = 6000;
	private static readonly OVERSIZED_SUB_GOAL_CHARS = 1200;
	private static readonly CONTEXT_OBJECTIVE_CHAR_BUDGET = 12000;
	private static readonly CONTEXT_RECORD_CHAR_BUDGET = 16000;
	private chains: Map<string, GoalChain> = new Map();
	private reproductiveClauseCache: Map<string, { clause: ReproductiveClause; timestamp: number }> = new Map();
	private chainIdCounter = 1;
	private subGoalIdCounter = 1;
	private readonly config: TelosConfig;
	private readonly distiller?: GoalChainDistiller;

	constructor(config?: PartialTelosConfig, distiller?: GoalChainDistiller) {
		this.config = mergeTelosConfig(config);
		this.distiller = distiller;
	}

	getConfig(): TelosConfig {
		return this.config;
	}

	/**
	 * Validate a persistence entry, returning structured diagnostics.
	 * Used by /goalchain diagnose and internal error recovery.
	 */
	static validateEntry(entry: unknown): SessionValidationResult {
		const warnings: string[] = [];
		const skippedChains: string[] = [];

		if (!entry || typeof entry !== "object") {
			return { valid: false, version: null, chainCount: 0, skippedChains, warnings: ["Entry is not a valid object"] };
		}

		const data = entry as Record<string, unknown>;
		const version = typeof data.schemaVersion === "number" ? data.schemaVersion : null;

		if (version !== null) {
			if (version < MIN_SCHEMA_VERSION) {
				warnings.push(`Schema version ${version} is below minimum supported version ${MIN_SCHEMA_VERSION}`);
			}
			if (version > GoalChainManager.SCHEMA_VERSION) {
				warnings.push(`Schema version ${version} is newer than current version ${GoalChainManager.SCHEMA_VERSION} — loaded with potential incompatibilities`);
			}
		}

		const chains = data.chains;
		if (!Array.isArray(chains)) {
			return { valid: false, version, chainCount: 0, skippedChains, warnings: [...warnings, "No chains array found"] };
		}

		let chainCount = 0;
		for (const chain of chains) {
			if (!chain || typeof chain !== "object") {
				skippedChains.push("<invalid>");
				warnings.push("Skipped non-object chain entry");
				continue;
			}
			const c = chain as Record<string, unknown>;
			if (!c.id || !c.primaryGoal) {
				skippedChains.push(String(c.id || "unknown"));
				warnings.push(`Chain "${c.id}" missing id or primaryGoal — skipped`);
				continue;
			}
			if (!c.reproductiveClause || typeof c.reproductiveClause !== "object") {
				skippedChains.push(String(c.id));
				warnings.push(`Chain "${c.id}" missing reproductive clause — skipped`);
				continue;
			}
			chainCount++;
		}

		const valid = chainCount > 0 && !warnings.some(w => w.includes("below minimum"));
		return { valid, version, chainCount, skippedChains, warnings };
	}

	/**
	 * Load goal chain state from session data with validation and graceful degradation.
	 */
	loadFromSession(sessionManager: { getEntries?: () => Array<{ type?: string; customType?: string; data?: unknown }>; getBranch?: () => Array<{ type?: string; customType?: string; data?: unknown }> }): void {
		this.chains = new Map();
		this.reproductiveClauseCache = new Map();
		this.chainIdCounter = 1;
		this.subGoalIdCounter = 1;

		// Custom extension state is session-level persistence and may not always be
		// present in the active branch immediately after /reload. Prefer getEntries(),
		// as recommended by Pi's extension persistence docs, and keep getBranch() as a
		// compatibility fallback for older runtimes.
		const entries = typeof sessionManager.getEntries === "function"
			? sessionManager.getEntries()
			: typeof sessionManager.getBranch === "function"
				? sessionManager.getBranch()
				: [];
		let latestEntry: GoalChainPersistenceEntry | null = null;

		for (const entry of entries) {
			if (entry.type === "custom" && entry.customType === "telos:goal-chains") {
				const candidate = entry.data as GoalChainPersistenceEntry;
				if (candidate?.chains && Array.isArray(candidate.chains)) {
					latestEntry = candidate;
				}
			}
		}

		if (!latestEntry) {
			return;
		}

		// Validate the persistence entry before loading
		const validation = GoalChainManager.validateEntry(latestEntry);
		if (!validation.valid) {
			// Graceful degradation: still attempt to load what we can
			// but log warnings for diagnostics
			if (validation.version !== null && validation.version < MIN_SCHEMA_VERSION) {
				// Old schema — skip entirely to prevent corruption
				return;
			}
		}

		this.chainIdCounter = Number(latestEntry.chainIdCounter) > 0 ? Number(latestEntry.chainIdCounter) : 1;
		this.subGoalIdCounter = Number(latestEntry.subGoalIdCounter) > 0 ? Number(latestEntry.subGoalIdCounter) : 1;

		for (const chain of latestEntry.chains) {
			if (!chain || typeof chain !== "object" || !chain.id || !chain.primaryGoal) {
				continue;
			}
			// Validate reproductive clause
			const clause = (chain as any).reproductiveClause;
			if (!clause || typeof clause !== "object" || !clause.primaryGoal || !clause.essentialPrinciples) {
				continue;
			}
			this.chains.set(chain.id, chain as GoalChain);
			this.reproductiveClauseCache.set(chain.id, {
				clause: clause as ReproductiveClause,
				timestamp: clause.lifelineTimestamp,
			});
		}
	}

	/**
	 * Create a serializable snapshot suitable for session persistence or handoff.
	 */
	getPersistenceSnapshot(): GoalChainPersistenceEntry {
		return {
			schemaVersion: GoalChainManager.SCHEMA_VERSION,
			chainIdCounter: this.chainIdCounter,
			subGoalIdCounter: this.subGoalIdCounter,
			chains: this.getAllGoalChains(),
		};
	}

	/**
	 * Persist goal chain state to session.
	 */
	async persistToSession(pi: { appendEntry?: (customType: string, data?: unknown) => void } | undefined): Promise<boolean> {
		if (typeof pi?.appendEntry !== "function") {
			return false;
		}

		pi.appendEntry("telos:goal-chains", this.getPersistenceSnapshot());
		return true;
	}

	/**
	 * Create a new goal chain
	 */
	createGoalChain(
		primaryGoal: string,
		essentialPrinciples?: string[],
		initialSubGoals?: string[],
	): GoalChain {
		const chainId = `chain-${this.chainIdCounter++}`;
		const now = Date.now();

		// Create initial reproductive clause
		const reproductiveClause: ReproductiveClause = {
			primaryGoal,
			essentialPrinciples: essentialPrinciples || [
				"Preserve the core purpose and intent",
				"Maintain alignment with original objectives",
				"Respect established constraints",
			],
			invariantConstraints: [],
			mutationGuidelines: [
				"Mutate conservatively and incrementally",
				"Preserve proven successful approaches",
				"Allow adaptation based on learnings",
			],
			lifelineTimestamp: now,
			version: 1,
		};

		// Cache the reproductive clause
		this.reproductiveClauseCache.set(chainId, { clause: reproductiveClause, timestamp: now });

		// Create initial sub-goals
		const subGoals: SubGoal[] = [];
		if (initialSubGoals && initialSubGoals.length > 0) {
			initialSubGoals.forEach((objective, index) => {
				subGoals.push(this.createSubGoal(objective, index, 1));
			});
		}

		const chain: GoalChain = {
			id: chainId,
			primaryGoal,
			reproductiveClause,
			subGoals,
			currentGeneration: 1,
			totalGenerations: 1,
			recordSpace: [],
			status: "active",
			createdAt: now,
			lastMutationAt: now,
		};

		// Add initial record entry
		this.addToRecordSpace(chain, "goal_created", chainId, `Goal chain created with primary goal: ${primaryGoal}`);

		this.chains.set(chainId, chain);
		return chain;
	}

	/**
	 * Create a sub-goal
	 */
	private createSubGoal(objective: string, index: number, generation: number): SubGoal {
		return {
			id: `subgoal-${this.subGoalIdCounter++}`,
			objective,
			status: "pending",
			generation,
			tokensUsed: 0,
			createdAt: Date.now(),
		};
	}

	/**
	 * Add sub-goals to a chain
	 */
	addSubGoals(chainId: string, objectives: string[]): SubGoal[] {
		const chain = this.chains.get(chainId);
		if (!chain) {
			throw new Error(`Goal chain ${chainId} not found`);
		}

		const newSubGoals: SubGoal[] = [];
		objectives.forEach((objective, index) => {
			const subGoal = this.createSubGoal(objective, index, chain.currentGeneration);
			chain.subGoals.push(subGoal);
			newSubGoals.push(subGoal);

			this.addToRecordSpace(chain, "goal_created", subGoal.id, `Sub-goal created: ${objective}`);
		});

		return newSubGoals;
	}

	/**
	 * Update sub-goal status. Accepts sub-goal IDs in either format:
	 * - Full ID: "subgoal-1", "subgoal-2", etc.
	 * - Numeric index: "1", "2", etc. (1-based position in the sub-goals list)
	 */
	updateSubGoalStatus(
		chainId: string,
		subGoalId: string,
		status: "active" | "complete" | "blocked",
		learnings?: string[],
	): SubGoal {
		const chain = this.chains.get(chainId);
		if (!chain) {
			throw new Error(`Goal chain ${chainId} not found`);
		}

		// Resolve numeric index to full sub-goal ID
		const resolvedId = this.resolveSubGoalId(chain, subGoalId);
		if (!resolvedId) {
			const available = chain.subGoals.map((sg) => sg.id).join(", ");
			throw new Error(`Sub-goal '${subGoalId}' not found in chain '${chainId}'. Available sub-goal IDs: ${available}`);
		}

		const subGoal = chain.subGoals.find((sg) => sg.id === resolvedId);
		if (!subGoal) {
			throw new Error(`Sub-goal ${resolvedId} not found`);
		}

		subGoal.status = status;

		if (status === "complete") {
			subGoal.completedAt = Date.now();
		}

		// Add to record space. Learnings are only evolutionary evidence when a sub-goal
		// completes or blocks; active updates are progress bookkeeping and should not
		// feed reproductive mutation.
		const evolutionaryLearnings = status === "complete" || status === "blocked" ? learnings : undefined;
		const details = evolutionaryLearnings
			? `Sub-goal ${status} with learnings: ${evolutionaryLearnings.join(", ")}`
			: `Sub-goal ${status}`;

		const recordType =
			status === "complete" ? "goal_completed" : status === "blocked" ? "goal_blocked" : "goal_updated";

		this.addToRecordSpace(
			chain,
			recordType,
			resolvedId,
			details,
			status === "complete",
			evolutionaryLearnings,
		);

		return subGoal;
	}

	/**
	 * Update sub-goal status and, when appropriate, run async distillation-gated evolution.
	 */
	async updateSubGoalStatusAsync(
		chainId: string,
		subGoalId: string,
		status: "active" | "complete" | "blocked",
		learnings?: string[],
	): Promise<{ subGoal: SubGoal; mutation: GoalChainMutation | null }> {
		const subGoal = this.updateSubGoalStatus(chainId, subGoalId, status, learnings);
		const mutation = status === "complete" || status === "blocked"
			? await this.maybeEvolveChainAsync(chainId)
			: null;
		return { subGoal, mutation };
	}

	/**
	 * Mutate the reproductive clause (conservative evolution)
	 */
	mutateReproductiveClause(
		chainId: string,
		newPrimaryGoal?: string,
		newPrinciples?: string[],
		mutationReason: string = "Unspecified mutation",
		confidence: number = 0.7,
		removePrinciples?: string[],
	): GoalChainMutation {
		const chain = this.chains.get(chainId);
		if (!chain) {
			throw new Error(`Goal chain ${chainId} not found`);
		}

		const previousClause: ReproductiveClause = {
			...chain.reproductiveClause,
			essentialPrinciples: [...chain.reproductiveClause.essentialPrinciples],
			invariantConstraints: [...chain.reproductiveClause.invariantConstraints],
			mutationGuidelines: [...chain.reproductiveClause.mutationGuidelines],
		};

		const basePrinciples = this.dedupeTexts(newPrinciples || chain.reproductiveClause.essentialPrinciples);
		const removedPrincipleKeys = new Set(
			(removePrinciples || []).map((principle) => this.normalizeText(principle)).filter(Boolean),
		);
		const evolvedPrinciples = removedPrincipleKeys.size > 0
			? basePrinciples.filter((principle) => !removedPrincipleKeys.has(this.normalizeText(principle)))
			: basePrinciples;

		if (basePrinciples.length > 0 && evolvedPrinciples.length === 0) {
			throw new Error("Subtractive mutation would remove all essential principles; refusing unsafe mutation");
		}

		// Create new clause with conservative mutation
		const newClause: ReproductiveClause = {
			primaryGoal: newPrimaryGoal || chain.reproductiveClause.primaryGoal,
			essentialPrinciples: evolvedPrinciples.slice(0, 8),
			invariantConstraints: [...chain.reproductiveClause.invariantConstraints],
			mutationGuidelines: [...chain.reproductiveClause.mutationGuidelines],
			lifelineTimestamp: Date.now(),
			version: chain.reproductiveClause.version + 1,
		};

		// Update cache
		this.reproductiveClauseCache.set(chainId, { clause: newClause, timestamp: Date.now() });

		// Update chain
		chain.reproductiveClause = newClause;
		chain.primaryGoal = newClause.primaryGoal;
		chain.lastMutationAt = Date.now();
		chain.currentGeneration++;
		chain.totalGenerations = Math.max(chain.totalGenerations, chain.currentGeneration);

		// Add to record space
		this.addToRecordSpace(chain, "goal_mutated", chainId, mutationReason);

		return {
			previousClause,
			newClause,
			mutationReason,
			confidence,
			timestamp: Date.now(),
		};
	}

	/**
	 * Evolve the chain through an async, configured distiller. No hidden deterministic substitute.
	 */
	async maybeEvolveChainAsync(chainId: string): Promise<GoalChainMutation | null> {
		const chain = this.chains.get(chainId);
		if (!chain || !this.shouldEvolveChain(chain)) {
			return null;
		}

		const completedGoals = chain.subGoals.filter((sg) => sg.status === "complete");
		const blockedGoals = chain.subGoals.filter((sg) => sg.status === "blocked");
		const lastMutationIndex = this.findLastRecordIndex(chain.recordSpace, (entry) => entry.type === "goal_mutated");
		const freshLearnings = chain.recordSpace
			.slice(lastMutationIndex + 1)
			.filter((entry) => entry.type === "goal_completed" || entry.type === "goal_blocked")
			.flatMap((entry) => entry.learnings || []);

		if (!this.config.goalChain.distiller.enabled || !this.distiller) {
			this.addToRecordSpace(
				chain,
				"distillation_skipped",
				chainId,
				"Automatic reproductive-clause mutation skipped: no configured equivalent distiller is available",
			);
			return null;
		}

		const previousStatus = chain.status;
		chain.status = "evolving";
		try {
			const contextSummary = this.compactChain(chain);
			const result = await this.distiller.distill(
				{
					chainId,
					primaryGoal: chain.primaryGoal,
					reproductiveClause: chain.reproductiveClause,
					contextSummary,
					freshLearnings,
					completedGoalCount: completedGoals.length,
					blockedGoalCount: blockedGoals.length,
				},
				this.config,
			);
			const distilledPrinciples = this.dedupeTexts(result.principles).slice(0, this.config.goalChain.distiller.maxPrinciples);
			if (distilledPrinciples.length === 0) {
				this.addToRecordSpace(
					chain,
					"distillation_skipped",
					chainId,
					"Automatic reproductive-clause mutation skipped: distiller returned no validated principles",
				);
				return null;
			}
			return this.mutateReproductiveClause(
				chainId,
				chain.reproductiveClause.primaryGoal,
				distilledPrinciples,
				result.reason || `Distilled ${freshLearnings.length} fresh learning(s) through ${this.config.goalChain.distiller.model}`,
				Number.isFinite(result.confidence) ? Math.max(0, Math.min(1, result.confidence)) : 0.7,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.addToRecordSpace(
				chain,
				"distillation_skipped",
				chainId,
				`Automatic reproductive-clause mutation skipped: distiller failed (${message})`,
			);
			return null;
		} finally {
			chain.status = previousStatus === "evolving" ? "active" : previousStatus;
		}
	}

	/**
	 * Check if chain should evolve
	 */
	private shouldEvolveChain(chain: GoalChain): boolean {
		const completedGoals = chain.subGoals.filter((sg) => sg.status === "complete");
		const minGoalsForEvolution = 2;
		const lastMutationIndex = this.findLastRecordIndex(chain.recordSpace, (entry) => entry.type === "goal_mutated");
		const recordsSinceLastMutation = chain.recordSpace.slice(lastMutationIndex + 1);

		// Need minimum completed goals and fresh completion/blocking learnings since the last mutation.
		return (
			completedGoals.length >= minGoalsForEvolution &&
			recordsSinceLastMutation.some(
				(entry) =>
					(entry.type === "goal_completed" || entry.type === "goal_blocked") &&
					Boolean(entry.learnings && entry.learnings.length > 0),
			)
		);
	}

	private dedupeTexts(values: string[]): string[] {
		const seen = new Set<string>();
		return values.filter((value) => {
			const normalized = this.normalizeText(value);
			if (!normalized || seen.has(normalized)) {
				return false;
			}
			seen.add(normalized);
			return true;
		});
	}

	private normalizeText(value: string): string {
		return value.trim().replace(/\s+/g, " ").toLowerCase();
	}

	private findLastRecordIndex(records: RecordSpaceEntry[], predicate: (record: RecordSpaceEntry) => boolean): number {
		for (let index = records.length - 1; index >= 0; index--) {
			if (predicate(records[index])) {
				return index;
			}
		}
		return -1;
	}

	private summarizeText(value: string, maxLength = GoalChainManager.SUB_GOAL_SUMMARY_CHARS): string {
		const cleaned = value.trim().replace(/\s+/g, " ");
		return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
	}

	/**
	 * Measure context entropy so compaction is deterministic, not subjective.
	 */
	getContextMetrics(chain: GoalChain): GoalChainContextMetrics {
		const totalObjectiveChars = chain.subGoals.reduce((sum, sg) => sum + sg.objective.length, 0);
		const totalRecordChars = chain.recordSpace.reduce((sum, record) => {
			const learningChars = (record.learnings || []).reduce((acc, learning) => acc + learning.length, 0);
			return sum + record.details.length + learningChars;
		}, 0);
		const oversizedSubGoals = chain.subGoals.filter(
			(sg) => sg.objective.length > GoalChainManager.OVERSIZED_SUB_GOAL_CHARS,
		).length;
		const inferredContextDumps = chain.subGoals.filter(
			(sg) => sg.inferredFromRecord && sg.objective.length > GoalChainManager.SUB_GOAL_SUMMARY_CHARS * 2,
		).length;
		const completedSubGoals = chain.subGoals.filter((sg) => sg.status === "complete").length;
		const rawRecordCount = chain.recordSpace.length;
		const needsCompaction =
			totalObjectiveChars > GoalChainManager.CONTEXT_OBJECTIVE_CHAR_BUDGET ||
			totalRecordChars > GoalChainManager.CONTEXT_RECORD_CHAR_BUDGET ||
			oversizedSubGoals > 0 ||
			inferredContextDumps > 0 ||
			completedSubGoals > 12 ||
			rawRecordCount > 50;

		return {
			totalObjectiveChars,
			totalRecordChars,
			oversizedSubGoals,
			inferredContextDumps,
			rawRecordCount,
			completedSubGoals,
			needsCompaction,
		};
	}

	/**
	 * Distill completed history into warm memory while keeping full details lookupable.
	 */
	compactGoalChain(chainId: string): GoalChainContextSummary {
		const chain = this.chains.get(chainId);
		if (!chain) {
			throw new Error(`Goal chain ${chainId} not found`);
		}
		return this.compactChain(chain);
	}

	private compactChain(chain: GoalChain): GoalChainContextSummary {
		const metrics = this.getContextMetrics(chain);
		const completed = chain.subGoals.filter((sg) => sg.status === "complete");
		const completedByGeneration = new Map<number, number>();
		for (const sg of completed) {
			completedByGeneration.set(sg.generation, (completedByGeneration.get(sg.generation) || 0) + 1);
		}
		const generationSummary = Array.from(completedByGeneration.entries())
			.sort((a, b) => a[0] - b[0])
			.map(([generation, count]) => `g${generation}: ${count}`)
			.join(", ") || "none";

		const learningSupport = new Map<string, { text: string; count: number; latest: number }>();
		for (const record of chain.recordSpace) {
			if (!record.learnings?.length) continue;
			for (const learning of record.learnings) {
				const normalized = this.normalizeText(learning);
				if (!normalized) continue;
				const existing = learningSupport.get(normalized);
				if (existing) {
					existing.count++;
					existing.latest = Math.max(existing.latest, record.timestamp);
				} else {
					learningSupport.set(normalized, { text: this.summarizeText(learning, 220), count: 1, latest: record.timestamp });
				}
			}
		}

		const rankedLearnings = Array.from(learningSupport.values()).sort((a, b) => {
			if (b.count !== a.count) return b.count - a.count;
			return b.latest - a.latest;
		});
		const stableLearnings = rankedLearnings.slice(0, 8).map((item) =>
			item.count > 1 ? `${item.text} (${item.count} supporting records)` : item.text,
		);
		const recentLearnings = chain.recordSpace
			.slice(-20)
			.flatMap((entry) => entry.learnings || [])
			.reverse()
			.map((learning) => this.summarizeText(learning, 180));

		const retainedCompletedIds = new Set(
			[...completed]
				.sort((a, b) => (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt))
				.slice(0, GoalChainManager.COMPLETED_SUB_GOAL_FULL_DISPLAY_LIMIT)
				.map((sg) => sg.id),
		);
		const archivedSubGoalIds = completed.filter((sg) => !retainedCompletedIds.has(sg.id)).map((sg) => sg.id);

		const curator = this.config.goalChain.curator;
		const summary: GoalChainContextSummary = {
			generatedAt: Date.now(),
			generation: chain.currentGeneration,
			sourceSubGoalCount: chain.subGoals.length,
			sourceRecordCount: chain.recordSpace.length,
			completedSummary: `${completed.length} completed sub-goals across generations (${generationSummary}). Full historical detail is cold memory; use sub-goal detail lookup when needed.`,
			stableLearnings,
			recentLearnings: this.dedupeTexts(recentLearnings).slice(0, 6),
			archivedSubGoalIds,
			metrics,
			curator: {
				enabled: curator.enabled,
				provider: curator.provider,
				host: curator.host,
				model: curator.model,
				topK: curator.topK,
				anchorFiles: [...curator.anchorFiles],
			},
		};
		chain.contextSummary = summary;
		return summary;
	}

	private ensureContextSummary(chain: GoalChain): GoalChainContextSummary {
		const metrics = this.getContextMetrics(chain);
		if (
			!chain.contextSummary ||
			metrics.needsCompaction ||
			chain.contextSummary.sourceSubGoalCount !== chain.subGoals.length ||
			chain.contextSummary.sourceRecordCount !== chain.recordSpace.length
		) {
			return this.compactChain(chain);
		}
		return chain.contextSummary;
	}

	/**
	 * Infer sub-goals from record space.
	 *
	 * This method gathers the full historical context of the chain — completed
	 * sub-goals with their learnings, blocked sub-goals with their failure
	 * reasons, the reproductive clause principles, and the current state of
	 * all sub-goals — and packages it as an inference prompt that an LLM can
	 * reason over to produce meaningful next-step suggestions.
	 *
	 * The inference itself is LLM-generated. This method does NOT perform
	 * keyword matching, regex, or any heuristic sub-goal generation.
	 */
	inferSubGoals(chainId: string): SubGoal[] {
		const chain = this.chains.get(chainId);
		if (!chain) {
			throw new Error(`Goal chain ${chainId} not found`);
		}

		const inferredGoals: SubGoal[] = [];
		const existingObjectives = new Set(
			chain.subGoals.map((subGoal) => this.normalizeText(subGoal.objective)),
		);
		const addInferredGoal = (objective: string, details: string) => {
			const normalized = this.normalizeText(objective);
			if (!normalized || existingObjectives.has(normalized)) {
				return;
			}

			const subGoal = this.createSubGoal(objective, 0, chain.currentGeneration);
			subGoal.inferredFromRecord = true;
			inferredGoals.push(subGoal);
			existingObjectives.add(normalized);
			this.addToRecordSpace(chain, "inference", subGoal.id, details);
		};

		// Build a compacted inference context from hot/warm memory, not raw cold history.
		const inferenceContext = this.buildInferenceContext(chain);

		// If there are no actionable sub-goals and no record to reason from,
		// produce a minimal inference that tells the LLM to decompose the
		// primary goal.
		const actionableGoals = chain.subGoals.filter(
			(sg) => sg.status === "pending" || sg.status === "active",
		);

		if (actionableGoals.length === 0) {
			// Keep inferred objectives concise; full context belongs in warm memory and lookup tools.
			addInferredGoal(
				"Analyze compacted chain context and infer the next implementation step",
				`Inferred — compact context prepared (${inferenceContext.length} chars); LLM should reason over warm memory and retrieve cold details only when needed.`,
			);
		} else {
			// Even when there are pending sub-goals, the LLM may benefit from
			// seeing the full record to decide which to work on next.
			this.addToRecordSpace(
				chain,
				"inference",
				"infer-context",
				`Compact inference context prepared (${inferenceContext.length} chars): ${actionableGoals.length} actionable sub-goals. Retrieve sub-goal details only when needed.`,
			);
		}

		// Add inferred goals to chain
		inferredGoals.forEach((goal) => chain.subGoals.push(goal));

		return inferredGoals;
	}

	/**
	 * Build a compact inference context from hot/warm memory.
	 * Cold historical detail remains available through detail lookup.
	 */
	private buildInferenceContext(chain: GoalChain): string {
		const summary = this.ensureContextSummary(chain);
		const lines: string[] = [];

		lines.push(`Primary goal: ${this.summarizeText(chain.primaryGoal, 500)}`);
		lines.push(`Generation: ${chain.currentGeneration} (clause v${chain.reproductiveClause.version})`);
		lines.push(`Essential principles:`);
		chain.reproductiveClause.essentialPrinciples.forEach((p) => lines.push(`  - ${this.summarizeText(p, 220)}`));

		const completed = chain.subGoals.filter((sg) => sg.status === "complete");
		const blocked = chain.subGoals.filter((sg) => sg.status === "blocked");
		const pending = chain.subGoals.filter((sg) => sg.status === "pending");
		const active = chain.subGoals.filter((sg) => sg.status === "active");

		lines.push(`\nHot memory:`);
		lines.push(`  Sub-goals: ${chain.subGoals.length} total, ${completed.length} done, ${active.length} active, ${pending.length} pending, ${blocked.length} blocked`);
		if (active.length > 0) {
			lines.push(`  Active sub-goals (fullest working text):`);
			active.slice(0, 3).forEach((sg) => lines.push(`    [${sg.id}] ${this.summarizeText(sg.objective, GoalChainManager.ACTIVE_SUB_GOAL_DETAIL_CHARS)}`));
		}
		if (pending.length > 0) {
			lines.push(`  Pending sub-goals:`);
			pending.slice(0, 8).forEach((sg) => lines.push(`    [${sg.id}] ${this.summarizeText(sg.objective)}`));
			if (pending.length > 8) lines.push(`    ... ${pending.length - 8} more pending; use detail lookup as needed`);
		}
		if (blocked.length > 0) {
			lines.push(`  Blocked sub-goals:`);
			blocked.slice(-5).forEach((sg) => lines.push(`    [${sg.id}] ${this.summarizeText(sg.objective)}`));
		}

		lines.push(`\nWarm memory:`);
		lines.push(`  ${summary.completedSummary}`);
		if (summary.stableLearnings.length > 0) {
			lines.push(`  Stable learnings:`);
			summary.stableLearnings.forEach((learning) => lines.push(`    - ${learning}`));
		}
		if (summary.recentLearnings.length > 0) {
			lines.push(`  Recent learnings:`);
			summary.recentLearnings.slice(0, 5).forEach((learning) => lines.push(`    - ${learning}`));
		}

		const recentCompleted = completed
			.slice()
			.sort((a, b) => (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt))
			.slice(0, GoalChainManager.COMPLETED_SUB_GOAL_FULL_DISPLAY_LIMIT);
		if (recentCompleted.length > 0) {
			lines.push(`  Recent completed sub-goals:`);
			recentCompleted.forEach((sg) => lines.push(`    [${sg.id}] ${this.summarizeText(sg.objective)}`));
		}

		lines.push(`\nCold memory:`);
		lines.push(`  Archived completed sub-goals: ${summary.archivedSubGoalIds.length}`);
		lines.push(`  Raw record entries: ${chain.recordSpace.length}`);
		lines.push(`  Use get_sub_goal_detail(chain_id, sub_goal_id) for full objective/learnings.`);

		const recentRecords = chain.recordSpace.slice(-8);
		if (recentRecords.length > 0) {
			lines.push(`\nRecent record space:`);
			for (const r of recentRecords) {
				lines.push(`  [${r.type}] ${this.summarizeText(r.details, 220)}`);
			}
		}

		return this.summarizeText(lines.join("\n"), GoalChainManager.INFERENCE_CONTEXT_CHARS);
	}

	/**
	 * Infer alternative objective for a blocked goal, informed by the
	 * full record space rather than keyword matching.
	 *
	 * Returns a suggested reframe based on learnings from the chain's
	 * record, if any exist. Falls back to a generic suggestion when
	 * there is no learning to draw from.
	 */
	private inferAlternativeObjective(blockedGoal: SubGoal, chain: GoalChain): string | null {
		const relevantLearnings = chain.recordSpace
			.filter((r) => r.type === "goal_completed" || r.type === "goal_blocked")
			.flatMap((r) => r.learnings || []);

		if (relevantLearnings.length > 0) {
			// Use the most relevant learning(s) to reframe the blocked goal.
			return `Rework blocked goal in light of chain learnings:\n  Blocked: ${blockedGoal.objective}\n  Relevant learnings: ${relevantLearnings.slice(-3).join("; ")}`;
		}

		// No learnings to draw from — suggest decomposition.
		return `Break down blocked goal ${blockedGoal.id} into smaller steps: ${blockedGoal.objective}`;
	}

	/**
	 * Resolve a sub-goal ID string to an internal sub-goal ID.
	 * Accepts either the full ID ("subgoal-N") or a 1-based numeric index.
	 */
	private resolveSubGoalId(chain: GoalChain, inputId: string): string | null {
		// Try full ID match first (e.g., "subgoal-1")
		if (inputId.startsWith("subgoal-")) {
			const found = chain.subGoals.find((sg) => sg.id === inputId);
			if (found) return found.id;
		}

		// Try numeric index (1-based)
		const numeric = Number.parseInt(inputId, 10);
		if (Number.isFinite(numeric) && numeric >= 1 && numeric <= chain.subGoals.length) {
			return chain.subGoals[numeric - 1].id;
		}

		return null;
	}

	/**
	 * Get cached reproductive clause
	 */
	getCachedReproductiveClause(chainId: string): ReproductiveClause | null {
		const cached = this.reproductiveClauseCache.get(chainId);
		if (!cached) {
			return null;
		}

		// Cache is valid for 1 hour
		const cacheAge = Date.now() - cached.timestamp;
		if (cacheAge > 3600000) {
			this.reproductiveClauseCache.delete(chainId);
			return null;
		}

		return cached.clause;
	}

	/**
	 * Add entry to record space
	 */
	private addToRecordSpace(
		chain: GoalChain,
		type: RecordSpaceEntry["type"],
		goalId: string,
		details: string,
		success?: boolean,
		learnings?: string[],
	): void {
		chain.recordSpace.push({
			type,
			goalId,
			timestamp: Date.now(),
			details,
			success,
			learnings,
		});

		// Keep record space manageable. Detailed old sub-goal data remains lookupable.
		if (chain.recordSpace.length > 100) {
			chain.recordSpace = chain.recordSpace.slice(-50);
		}

		if (this.getContextMetrics(chain).needsCompaction) {
			this.compactChain(chain);
		}
	}

	/**
	 * Get goal chain
	 */
	getGoalChain(chainId: string): GoalChain | null {
		return this.chains.get(chainId) || null;
	}

	/**
	 * Get detailed cold-memory information for one sub-goal.
	 */
	getSubGoalDetail(chainId: string, subGoalId: string): string {
		const chain = this.chains.get(chainId);
		if (!chain) {
			throw new Error(`Goal chain ${chainId} not found`);
		}
		const resolvedId = this.resolveSubGoalId(chain, subGoalId);
		const subGoal = resolvedId ? chain.subGoals.find((sg) => sg.id === resolvedId) : null;
		if (!subGoal) {
			throw new Error(`Sub-goal ${subGoalId} not found in chain ${chainId}`);
		}

		const records = chain.recordSpace.filter((record) => record.goalId === subGoal.id);
		const lines = [
			`SUB-GOAL DETAIL: ${subGoal.id}`,
			`Chain: ${chain.id}`,
			`Status: ${subGoal.status.toUpperCase()}`,
			`Generation: ${subGoal.generation}`,
			`Created: ${new Date(subGoal.createdAt).toLocaleString()}`,
		];
		if (subGoal.completedAt) {
			lines.push(`Completed: ${new Date(subGoal.completedAt).toLocaleString()}`);
		}
		lines.push("", "OBJECTIVE:", subGoal.objective);
		if (records.length > 0) {
			lines.push("", `RECORDS (${records.length}):`);
			for (const record of records) {
				lines.push(`- [${record.type}] ${new Date(record.timestamp).toLocaleString()} -> ${record.details}`);
				if (record.learnings?.length) {
					record.learnings.forEach((learning) => lines.push(`  -> ${learning}`));
				}
			}
		}
		return lines.join("\n");
	}

	/**
	 * Get all goal chains
	 */
	getAllGoalChains(): GoalChain[] {
		return Array.from(this.chains.values());
	}

	/**
	 * Delete goal chain
	 */
	deleteGoalChain(chainId: string): boolean {
		this.reproductiveClauseCache.delete(chainId);
		return this.chains.delete(chainId);
	}

	/**
	 * Format goal chain for display
	 */
	formatGoalChain(chain: GoalChain): string {
		const createdAt = new Date(chain.createdAt).toLocaleString();
		const lastMutation = new Date(chain.lastMutationAt).toLocaleString();
		const summary = this.ensureContextSummary(chain);
		const toSafeText = (value: unknown, maxLength = GoalChainManager.SUB_GOAL_SUMMARY_CHARS) => {
			if (typeof value !== "string") {
				return "<invalid text>";
			}
			const trimmed = value.trim();
			if (!trimmed) {
				return "<empty>";
			}
			return this.summarizeText(trimmed, maxLength);
		};

		const lines = [
			`GOAL CHAIN: ${chain.id}`,
			`Status: ${chain.status.toUpperCase()}`,
			`Generation: ${chain.currentGeneration} / ${chain.totalGenerations}`,
			`Created: ${createdAt}`,
			`Last Mutation: ${lastMutation}`,
			`Sub-Goals: ${chain.subGoals.length}`,
			`Context: ${summary.metrics.needsCompaction ? "COMPACTED" : "WITHIN BUDGET"} · ${summary.archivedSubGoalIds.length} archived · ${summary.metrics.oversizedSubGoals} oversized`,
			``, 
			`PRIMARY GOAL:`,
			`${toSafeText(chain.primaryGoal, 600)}`,
			``,
			`REPRODUCTIVE CLAUSE (v${chain.reproductiveClause.version}):`,
			`  Updated: ${new Date(chain.reproductiveClause.lifelineTimestamp).toLocaleString()}`,
			`  Essential Principles:`,
			...(chain.reproductiveClause.essentialPrinciples || []).map((principle, index) =>
				`    ${index + 1}. ${toSafeText(principle)}`,
			),
			`  Mutation Guidelines:`,
			...(chain.reproductiveClause.mutationGuidelines || []).map((guideline, index) =>
				`    ${index + 1}. ${toSafeText(guideline)}`,
			),
			`  Invariant Constraints:`,
			...(chain.reproductiveClause.invariantConstraints || []).map((constraint, index) =>
				`    ${index + 1}. ${toSafeText(constraint)}`,
			),
			``,
			`SUB-GOALS:`,
		];

		if (chain.subGoals.length === 0) {
			lines.push("  (none)");
		} else {
			const now = Date.now();
			const completedSubGoals = chain.subGoals.filter((subGoal) => subGoal.status === "complete");
			const completedByRecency = [...completedSubGoals].sort(
				(a, b) => (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt),
			);
			const retainedCompletedIds = new Set(
				completedByRecency
					.filter(
						(subGoal, index) =>
							index < GoalChainManager.COMPLETED_SUB_GOAL_FULL_DISPLAY_LIMIT ||
							Boolean(
								subGoal.completedAt &&
									now - subGoal.completedAt <= GoalChainManager.COMPLETED_SUB_GOAL_RECENT_WINDOW_MS,
							),
					)
					.map((subGoal) => subGoal.id),
			);
			const archivedCompleted = completedSubGoals.filter((subGoal) => !retainedCompletedIds.has(subGoal.id));

			if (archivedCompleted.length > 0) {
				const latestArchived = archivedCompleted.reduce((latest, subGoal) =>
					(subGoal.completedAt || subGoal.createdAt) > (latest.completedAt || latest.createdAt)
						? subGoal
						: latest,
				);
				lines.push(
					`  (${archivedCompleted.length} older completed sub-goal(s) summarized; latest archived completion: ${new Date(
						latestArchived.completedAt || latestArchived.createdAt,
					).toLocaleString()}; use get_sub_goal_detail for full text)`,
				);
			}

			chain.subGoals.forEach((subGoal, index) => {
				if (subGoal.status === "complete" && !retainedCompletedIds.has(subGoal.id)) {
					return;
				}

				const inferred = subGoal.inferredFromRecord ? " [inferred]" : "";
				const objectiveLimit = subGoal.status === "active"
					? GoalChainManager.ACTIVE_SUB_GOAL_DETAIL_CHARS
					: GoalChainManager.SUB_GOAL_SUMMARY_CHARS;
				const detailHint = subGoal.objective.length > objectiveLimit ? " (detail lookup available)" : "";
				lines.push(
					`  [${subGoal.id}] ${index + 1}. [${subGoal.status.toUpperCase()}]${inferred} Gen ${subGoal.generation} - ${toSafeText(
						subGoal.objective,
						objectiveLimit,
					)}${detailHint}`,
				);
				if (subGoal.tokenBudget) {
					const percent = subGoal.tokensUsed
						? Math.round((subGoal.tokensUsed / subGoal.tokenBudget) * 100)
						: 0;
					lines.push(`     Budget: ${subGoal.tokensUsed}/${subGoal.tokenBudget} (${percent}%)`);
				}
				if (subGoal.completedAt) {
					lines.push(`     Completed: ${new Date(subGoal.completedAt).toLocaleString()}`);
				}
			});
		}

		lines.push("");
		if (chain.recordSpace.length === 0) {
			lines.push(`RECORD SPACE: (0 entries)`);
			return lines.join("\n");
		}

		lines.push(`RECORD SPACE (${chain.recordSpace.length} entries):`);
		const latestEntries = chain.recordSpace.slice(-5);
		latestEntries.forEach((entry, index) => {
			lines.push(
				`  ${chain.recordSpace.length - latestEntries.length + index + 1}. [${entry.type}] ${new Date(
					entry.timestamp,
				).toLocaleString()} -> ${toSafeText(entry.details)}`,
			);
		});

		return lines.join("\n");
	}

	/**
	 * Generate chain statistics
	 */
	getChainStatistics(chain: GoalChain): {
		totalSubGoals: number;
		completedSubGoals: number;
		blockedSubGoals: number;
		activeSubGoals: number;
		inferredSubGoals: number;
		totalTokensUsed: number;
		successRate: number;
		averageGeneration: number;
	} {
		return {
			totalSubGoals: chain.subGoals.length,
			completedSubGoals: chain.subGoals.filter((sg) => sg.status === "complete").length,
			blockedSubGoals: chain.subGoals.filter((sg) => sg.status === "blocked").length,
			activeSubGoals: chain.subGoals.filter((sg) => sg.status === "active").length,
			inferredSubGoals: chain.subGoals.filter((sg) => sg.inferredFromRecord).length,
			totalTokensUsed: chain.subGoals.reduce((sum, sg) => sum + sg.tokensUsed, 0),
			successRate:
				chain.subGoals.length > 0
					? chain.subGoals.filter((sg) => sg.status === "complete").length / chain.subGoals.length
					: 0,
			averageGeneration:
				chain.subGoals.length > 0
					? chain.subGoals.reduce((sum, sg) => sum + sg.generation, 0) / chain.subGoals.length
					: 0,
		};
	}

	/**
	 * Get a structured actionable summary of a chain for TUI widget display.
	 *
	 * Returns a compact summary that can be used by TUI components to display
	 * chain status, progress, and actionable items without formatting the full
	 * chain text.
	 */
	getActionableSummary(chain: GoalChain): {
		id: string;
		status: string;
		primaryGoal: string;
		primaryGoalShort: string;
		generation: number;
		clauseVersion: number;
		subGoalCounts: {
			total: number;
			completed: number;
			blocked: number;
			active: number;
			pending: number;
			inferred: number;
		};
		progressString: string;
		recentLearnings: string[];
		actionableSubGoals: Array<{ id: string; status: string; objective: string }>;
		lastMutationAt: number;
	} {
		const completed = chain.subGoals.filter((sg) => sg.status === "complete");
		const blocked = chain.subGoals.filter((sg) => sg.status === "blocked");
		const active = chain.subGoals.filter((sg) => sg.status === "active");
		const pending = chain.subGoals.filter((sg) => sg.status === "pending");
		const inferred = chain.subGoals.filter((sg) => sg.inferredFromRecord);

		// Build progress string: "2/5 done · 1 active" format
		const progressParts: string[] = [];
		const total = chain.subGoals.length;
		if (completed.length > 0) progressParts.push(`${completed.length}/${total} done`);
		if (active.length > 0) progressParts.push(`${active.length} active`);
		if (blocked.length > 0) progressParts.push(`${blocked.length} blocked`);
		if (progressParts.length === 0 && total > 0) progressParts.push(`${total} pending`);

		// Gather recent learnings from the record space
		const recentLearnings: string[] = [];
		const maxLearnings = 3;
		for (let i = chain.recordSpace.length - 1; i >= 0 && recentLearnings.length < maxLearnings; i--) {
			const entry = chain.recordSpace[i];
			if (entry.learnings?.length) {
				recentLearnings.push(...entry.learnings);
			}
		}
		recentLearnings.reverse();

		return {
			id: chain.id,
			status: chain.status,
			primaryGoal: chain.primaryGoal,
			primaryGoalShort: truncateForDisplay(chain.primaryGoal, 40),
			generation: chain.currentGeneration,
			clauseVersion: chain.reproductiveClause.version,
			subGoalCounts: {
				total,
				completed: completed.length,
				blocked: blocked.length,
				active: active.length,
				pending: pending.length,
				inferred: inferred.length,
			},
			progressString: progressParts.join(" · "),
			recentLearnings,
			actionableSubGoals: [...active, ...pending].map((sg) => ({
				id: sg.id,
				status: sg.status,
				objective: sg.objective,
			})),
			lastMutationAt: chain.lastMutationAt,
		};
	}
}