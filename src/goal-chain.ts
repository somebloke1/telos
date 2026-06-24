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

export interface GoalChain {
	id: string;
	primaryGoal: string;
	reproductiveClause: ReproductiveClause;
	subGoals: SubGoal[];
	currentGeneration: number;
	totalGenerations: number;
	recordSpace: RecordSpaceEntry[];
	status: "active" | "paused" | "complete" | "evolving";
	createdAt: number;
	lastMutationAt: number;
}

export interface RecordSpaceEntry {
	type: "goal_created" | "goal_updated" | "goal_completed" | "goal_blocked" | "goal_mutated" | "inference";
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

/**
 * GoalChainManager manages evolutionary goal chains
 */
export class GoalChainManager {
	private static readonly SCHEMA_VERSION = 1;
	private static readonly COMPLETED_SUB_GOAL_FULL_DISPLAY_LIMIT = 3;
	private static readonly COMPLETED_SUB_GOAL_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
	private chains: Map<string, GoalChain> = new Map();
	private reproductiveClauseCache: Map<string, { clause: ReproductiveClause; timestamp: number }> = new Map();
	private chainIdCounter = 1;
	private subGoalIdCounter = 1;

	/**
	 * Load goal chain state from session data.
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

		this.chainIdCounter = Number(latestEntry.chainIdCounter) > 0 ? Number(latestEntry.chainIdCounter) : 1;
		this.subGoalIdCounter = Number(latestEntry.subGoalIdCounter) > 0 ? Number(latestEntry.subGoalIdCounter) : 1;

		for (const chain of latestEntry.chains) {
			if (!chain || !chain.id || !chain.primaryGoal) {
				continue;
			}
			this.chains.set(chain.id, chain);
			this.reproductiveClauseCache.set(chain.id, {
				clause: chain.reproductiveClause,
				timestamp: chain.reproductiveClause.lifelineTimestamp,
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

		// Check if we should evolve the chain.
		// Active status updates are progress bookkeeping, not completed evidence.
		if ((status === "complete" || status === "blocked") && this.shouldEvolveChain(chain)) {
			this.evolveChain(chainId);
		}

		return subGoal;
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
	 * Evolve the chain based on record space and learnings
	 */
	private evolveChain(chainId: string): void {
		const chain = this.chains.get(chainId);
		if (!chain) {
			return;
		}

		chain.status = "evolving";

		// Inference happens here - would be LLM-generated in practice
		// For now, we'll infer based on completed sub-goals and learnings

		const completedGoals = chain.subGoals.filter((sg) => sg.status === "complete");
		const blockedGoals = chain.subGoals.filter((sg) => sg.status === "blocked");

		// Extract only fresh completion/blocking learnings since the last mutation.
		const lastMutationIndex = chain.recordSpace.findLastIndex((entry) => entry.type === "goal_mutated");
		const learnings = chain.recordSpace
			.slice(lastMutationIndex + 1)
			.filter((entry) => entry.type === "goal_completed" || entry.type === "goal_blocked")
			.flatMap((entry) => entry.learnings || []);

		// Conservative mutation based on learnings
		if (learnings.length > 0 && completedGoals.length >= 2) {
			// Only mutate if we have sufficient learnings
			const newPrinciples = this.refinePrinciples(chain.reproductiveClause.essentialPrinciples, learnings);

			this.mutateReproductiveClause(
				chainId,
				chain.reproductiveClause.primaryGoal,
				newPrinciples,
				`Evolution based on ${learnings.length} learnings from ${completedGoals.length} completed goals`,
				0.8,
			);
		}

		chain.status = "active";
	}

	/**
	 * Check if chain should evolve
	 */
	private shouldEvolveChain(chain: GoalChain): boolean {
		const completedGoals = chain.subGoals.filter((sg) => sg.status === "complete");
		const minGoalsForEvolution = 2;
		const lastMutationIndex = chain.recordSpace.findLastIndex((entry) => entry.type === "goal_mutated");
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

	/**
	 * Refine principles based on learnings
	 */
	private refinePrinciples(currentPrinciples: string[], learnings: string[]): string[] {
		// Conservative refinement - keep existing principles and add derived ones.
		// Dedupe while preserving order so repeated evolution does not bloat the lifeline.
		const refinedPrinciples = [...currentPrinciples];

		// Extract new principles from learnings (simplified - would be LLM-generated)
		const learningThemes = learnings
			.filter((learning) => learning.includes("should") || learning.includes("must"))
			.slice(0, 2);

		refinedPrinciples.push(...learningThemes);

		return this.dedupeTexts(refinedPrinciples).slice(0, 8);
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

	/**
	 * Infer sub-goals from record space
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

		// Analyze record space for patterns
		const blockedGoals = chain.subGoals.filter((sg) => sg.status === "blocked");
		const completedGoals = chain.subGoals.filter((sg) => sg.status === "complete");
		const actionableGoals = chain.subGoals.filter((sg) => sg.status === "pending" || sg.status === "active");

		// Inference 1: If goals are blocked, infer alternative approaches even when there
		// are no prior successes yet. Being blocked is already evidence to reframe.
		blockedGoals.forEach((blockedGoal) => {
			const alternativeObjective = this.inferAlternativeObjective(blockedGoal.objective, chain.recordSpace);
			if (alternativeObjective) {
				addInferredGoal(alternativeObjective, `Inferred from blocked goal ${blockedGoal.id}`);
			}
		});

		// Inference 2: If no actionable work remains, infer practical next steps from
		// the primary goal. This makes /goalchain infer useful for empty or fully
		// completed-but-still-active chains.
		if (actionableGoals.length === 0) {
			this.inferNextStepsFromPrimaryGoal(chain).forEach((objective) => {
				addInferredGoal(objective, "Inferred as next actionable step from primary goal");
			});
		}

		// Inference 3: If primary goal is complex and progress is still sparse, infer intermediate steps.
		if (chain.primaryGoal.length > 200 && completedGoals.length < Math.max(1, chain.subGoals.length / 2)) {
			this.inferIntermediateSteps(chain.primaryGoal, chain.recordSpace).forEach((objective) => {
				addInferredGoal(objective, "Inferred as intermediate step");
			});
		}

		// Add inferred goals to chain
		inferredGoals.forEach((goal) => chain.subGoals.push(goal));

		return inferredGoals;
	}

	/**
	 * Infer alternative objective for blocked goal
	 */
	private inferAlternativeObjective(blockedObjective: string, recordSpace: RecordSpaceEntry[]): string | null {
		const recentLearning = recordSpace
			.slice()
			.reverse()
			.find((entry) => entry.learnings && entry.learnings.length > 0)
			?.learnings?.[0];

		if (recentLearning) {
			return `Rework blocked goal with recent learning in mind: ${blockedObjective}`;
		}

		return `Break down and retry blocked goal: ${blockedObjective}`;
	}

	private inferNextStepsFromPrimaryGoal(chain: GoalChain): string[] {
		const goal = chain.primaryGoal.trim();
		const steps: string[] = [];
		const lowerGoal = goal.toLowerCase();

		if (chain.subGoals.length === 0) {
			steps.push(`Decompose primary goal into concrete sub-goals: ${this.truncateText(goal, 140)}`);
		}

		if (lowerGoal.includes("fix") || lowerGoal.includes("bug") || lowerGoal.includes("stable")) {
			steps.push("Audit current behavior and identify the smallest existing-feature bug to fix next");
			steps.push("Add or run a focused smoke test that proves the selected fix works");
		}

		if (lowerGoal.includes("test") || lowerGoal.includes("isolation") || lowerGoal.includes("pi-test")) {
			steps.push("Run the extension in isolated pi-test configuration and record the observed behavior");
		}

		if (lowerGoal.includes("github") || lowerGoal.includes("commit") || lowerGoal.includes("discipline")) {
			steps.push("Review git status and separate unrelated changes before committing or syncing fixes");
		}

		if (lowerGoal.includes("develop") || lowerGoal.includes("codebase") || lowerGoal.includes("software")) {
			steps.push("Inspect recent changes for a lean refactor or cleanup that supports the primary goal without adding scope");
		}

		if (steps.length === 0) {
			steps.push(`Identify the next smallest verifiable step toward: ${this.truncateText(goal, 140)}`);
			steps.push("Validate the next step with direct evidence before marking it complete");
		}

		return steps.slice(0, 4);
	}

	private truncateText(value: string, maxLength: number): string {
		const normalized = value.trim().replace(/\s+/g, " ");
		return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
	}

	/**
	 * Infer intermediate steps from primary goal
	 */
	private inferIntermediateSteps(primaryGoal: string, recordSpace: RecordSpaceEntry[]): string[] {
		// Simplified inference - would be LLM-generated in practice
		const steps: string[] = [];

		// Extract key actions from primary goal
		const actionWords = primaryGoal.match(/(implement|create|build|design|develop|analyze|test)/gi);
		if (actionWords && actionWords.length > 1) {
			actionWords.slice(0, 2).forEach((action, index) => {
				steps.push(`Step ${index + 1}: ${action} key components`);
			});
		}

		return steps;
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

		// Keep record space manageable
		if (chain.recordSpace.length > 100) {
			chain.recordSpace = chain.recordSpace.slice(-50);
		}
	}

	/**
	 * Get goal chain
	 */
	getGoalChain(chainId: string): GoalChain | null {
		return this.chains.get(chainId) || null;
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
		const toSafeText = (value: unknown) => {
			if (typeof value !== "string") {
				return "<invalid text>";
			}
			const trimmed = value.trim();
			if (!trimmed) {
				return "<empty>";
			}
			return trimmed.replace(/\s+/g, " ");
		};

		const lines = [
			`GOAL CHAIN: ${chain.id}`,
			`Status: ${chain.status.toUpperCase()}`,
			`Generation: ${chain.currentGeneration} / ${chain.totalGenerations}`,
			`Created: ${createdAt}`,
			`Last Mutation: ${lastMutation}`,
			`Sub-Goals: ${chain.subGoals.length}`,
			``,
			`PRIMARY GOAL:`,
			`${toSafeText(chain.primaryGoal)}`,
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
					`  (${archivedCompleted.length} older completed sub-goal(s) summarized to preserve context; latest archived completion: ${new Date(
						latestArchived.completedAt || latestArchived.createdAt,
					).toLocaleString()})`,
				);
			}

			chain.subGoals.forEach((subGoal, index) => {
				if (subGoal.status === "complete" && !retainedCompletedIds.has(subGoal.id)) {
					return;
				}

				const inferred = subGoal.inferredFromRecord ? " [inferred]" : "";
				lines.push(
					`  [${subGoal.id}] ${index + 1}. [${subGoal.status.toUpperCase()}]${inferred} Gen ${subGoal.generation} - ${toSafeText(
						subGoal.objective,
					)}`,
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
}