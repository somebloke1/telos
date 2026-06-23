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
	type: "goal_created" | "goal_completed" | "goal_blocked" | "goal_mutated" | "inference";
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

/**
 * GoalChainManager manages evolutionary goal chains
 */
export class GoalChainManager {
	private chains: Map<string, GoalChain> = new Map();
	private reproductiveClauseCache: Map<string, { clause: ReproductiveClause; timestamp: number }> = new Map();
	private chainIdCounter = 1;
	private subGoalIdCounter = 1;

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
	 * Update sub-goal status
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

		const subGoal = chain.subGoals.find((sg) => sg.id === subGoalId);
		if (!subGoal) {
			throw new Error(`Sub-goal ${subGoalId} not found`);
		}

		subGoal.status = status;

		if (status === "complete") {
			subGoal.completedAt = Date.now();
		}

		// Add to record space
		const details = learnings
			? `Sub-goal ${status} with learnings: ${learnings.join(", ")}`
			: `Sub-goal ${status}`;

		this.addToRecordSpace(
			chain,
			status === "complete" ? "goal_completed" : "goal_blocked",
			subGoalId,
			details,
			status === "complete",
			learnings,
		);

		// Check if we should evolve the chain
		if (this.shouldEvolveChain(chain)) {
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
		mutationReason: string,
		confidence: number = 0.7,
	): GoalChainMutation {
		const chain = this.chains.get(chainId);
		if (!chain) {
			throw new Error(`Goal chain ${chainId} not found`);
		}

		const previousClause = { ...chain.reproductiveClause };

		// Create new clause with conservative mutation
		const newClause: ReproductiveClause = {
			primaryGoal: newPrimaryGoal || chain.reproductiveClause.primaryGoal,
			essentialPrinciples: newPrinciples || chain.reproductiveClause.essentialPrinciples,
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

		// Extract learnings from record space
		const learnings = chain.recordSpace.flatMap((entry) => entry.learnings || []);

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

		// Need minimum completed goals and some learnings
		return (
			completedGoals.length >= minGoalsForEvolution &&
			chain.recordSpace.some((entry) => entry.learnings && entry.learnings.length > 0)
		);
	}

	/**
	 * Refine principles based on learnings
	 */
	private refinePrinciples(currentPrinciples: string[], learnings: string[]): string[] {
		// Conservative refinement - keep existing principles and add derived ones
		const refinedPrinciples = [...currentPrinciples];

		// Extract new principles from learnings (simplified - would be LLM-generated)
		const learningThemes = learnings
			.filter((learning) => learning.includes("should") || learning.includes("must"))
			.slice(0, 2);

		refinedPrinciples.push(...learningThemes);

		// Keep only top principles to prevent bloat
		return refinedPrinciples.slice(0, 8);
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

		// Analyze record space for patterns
		const blockedGoals = chain.subGoals.filter((sg) => sg.status === "blocked");
		const completedGoals = chain.subGoals.filter((sg) => sg.status === "complete");

		// Inference 1: If goals are blocked, infer alternative approaches
		blockedGoals.forEach((blockedGoal) => {
			const alternativeObjective = this.inferAlternativeObjective(blockedGoal.objective, chain.recordSpace);
			if (alternativeObjective) {
				const subGoal = this.createSubGoal(alternativeObjective, 0, chain.currentGeneration);
				subGoal.inferredFromRecord = true;
				inferredGoals.push(subGoal);

				this.addToRecordSpace(chain, "inference", subGoal.id, `Inferred from blocked goal ${blockedGoal.id}`);
			}
		});

		// Inference 2: If primary goal is complex, infer intermediate steps
		if (chain.primaryGoal.length > 200 && completedGoals.length < chain.subGoals.length / 2) {
			const intermediateSteps = this.inferIntermediateSteps(chain.primaryGoal, chain.recordSpace);
			intermediateSteps.forEach((objective) => {
				const subGoal = this.createSubGoal(objective, 0, chain.currentGeneration);
				subGoal.inferredFromRecord = true;
				inferredGoals.push(subGoal);

				this.addToRecordSpace(chain, "inference", subGoal.id, "Inferred as intermediate step");
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
		// Simplified inference - would be LLM-generated in practice
		const successPatterns = recordSpace
			.filter((entry) => entry.success && entry.type === "goal_completed")
			.map((entry) => entry.details);

		if (successPatterns.length === 0) {
			return null;
		}

		// Return a modified version suggesting alternative approach
		return `Alternative approach to: ${blockedObjective}`;
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
		const lines = [
			`GOAL CHAIN: ${chain.id}`,
			`Status: ${chain.status.toUpperCase()}`,
			`Generation: ${chain.currentGeneration} / ${chain.totalGenerations}`,
			``,
			`PRIMARY GOAL:`,
			chain.primaryGoal,
			``,
			`REPRODUCTIVE CLAUSE (v${chain.reproductiveClause.version}):`,
			`  Essential Principles:`,
			...chain.reproductiveClause.essentialPrinciples.map((p) => `    - ${p}`),
			`  Mutation Guidelines:`,
			...chain.reproductiveClause.mutationGuidelines.map((g) => `    - ${g}`),
			``,
			`SUB-GOALS (${chain.subGoals.length}):`,
		];

		chain.subGoals.forEach((subGoal, index) => {
			const inferred = subGoal.inferredFromRecord ? " [inferred]" : "";
			lines.push(
				`  ${index + 1}. [${subGoal.status.toUpperCase()}]${inferred} ${subGoal.objective}`,
			);
			if (subGoal.tokenBudget) {
				const percent = subGoal.tokensUsed
					? Math.round((subGoal.tokensUsed / subGoal.tokenBudget) * 100)
					: 0;
				lines.push(`     Budget: ${subGoal.tokensUsed}/${subGoal.tokenBudget} (${percent}%)`);
			}
		});

		lines.push("");
		lines.push(`RECORD SPACE (${chain.recordSpace.length} entries):`);
		lines.push(`  Latest: ${chain.recordSpace[chain.recordSpace.length - 1]?.details || "None"}`);

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