/**
 * Goal Manager
 *
 * Manages the lifecycle and persistence of goals within a session.
 * Goals are thread-scoped and persisted through the session manager.
 */

import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionManager } from "@earendil-works/pi-coding-agent";

export type GoalStatus = "active" | "paused" | "blocked" | "complete" | "budget_limited";

export interface Goal {
	id: string;
	objective: string;
	status: GoalStatus;
	tokenBudget?: number;
	tokensUsed: number;
	timeUsedSeconds: number;
	createdAt: number;
	updatedAt: number;
}

export interface GoalTemplate {
	id: string;
	name: string;
	description: string;
	objective: string;
}

const MAX_OBJECTIVE_CHARS = 4000;
const FILE_OBJECTIVE_PREFIX = "file:";
const TERMINAL_STATUSES: GoalStatus[] = ["complete", "blocked", "budget_limited"];
const DEFAULT_GOAL_TEMPLATES: GoalTemplate[] = [
	{
		id: "development",
		name: "Development",
		description: "Plan, implement, validate, and document a feature or product change.",
		objective: "Implement a development task methodically: clarify requirements, inspect the existing code, make incremental changes, add or update tests, validate behavior, update documentation when needed, and report risks or follow-up work.",
	},
	{
		id: "testing",
		name: "Testing",
		description: "Expand or repair test coverage with clear validation criteria.",
		objective: "Improve test coverage methodically: identify the behavior under test, inspect existing tests and gaps, add focused unit/integration coverage, run the relevant test suite, and document remaining risks or untested cases.",
	},
	{
		id: "documentation",
		name: "Documentation",
		description: "Update durable docs with accurate behavior, examples, and constraints.",
		objective: "Update documentation methodically: verify the implemented behavior from source, revise durable docs with stable design rationale and user-facing examples, avoid transient session-local identifiers, and validate links or references where practical.",
	},
	{
		id: "refactoring",
		name: "Refactoring",
		description: "Improve structure without changing externally visible behavior.",
		objective: "Refactor safely and incrementally: characterize current behavior, isolate the structural improvement, preserve public contracts, update tests only where behavior is intentionally clarified, run validation, and summarize any migration risks.",
	},
];

/**
 * GoalManager handles all goal state operations
 */
export class GoalManager {
	private goal: Goal | null = null;
	private nextGoalId = 1;
	private readonly templates: GoalTemplate[] = DEFAULT_GOAL_TEMPLATES;

	/**
	 * Create a new goal.
	 * Large objectives (>4000 chars) are stored transparently in GOAL.md.
	 */
	createGoal(objective: string, tokenBudget?: number): Goal {
		// Validate objective
		const trimmedObjective = objective.trim();
		if (!trimmedObjective) {
			throw new Error("Goal objective cannot be empty");
		}

		// Check for existing incomplete goal
		if (this.goal && !this.isTerminal(this.goal.status)) {
			throw new Error(
				"An unfinished goal already exists. Use update_goal to change status, or clear the goal first.",
			);
		}

		// Handle large objectives transparently
		const storedObjective = this.storeObjective(trimmedObjective);

		const now = Date.now();
		this.goal = {
			id: `goal-${this.nextGoalId++}`,
			objective: storedObjective,
			status: "active",
			tokenBudget,
			tokensUsed: 0,
			timeUsedSeconds: 0,
			createdAt: now,
			updatedAt: now,
		};

		return this.goal;
	}

	/**
	 * List available objective templates.
	 */
	listTemplates(): GoalTemplate[] {
		return this.templates.map((template) => ({ ...template }));
	}

	/**
	 * Find an objective template by id or case-insensitive name.
	 */
	getTemplate(templateIdOrName: string): GoalTemplate | null {
		const normalized = templateIdOrName.trim().toLowerCase();
		if (!normalized) return null;
		const template = this.templates.find((candidate) => (
			candidate.id.toLowerCase() === normalized ||
			candidate.name.toLowerCase() === normalized
		));
		return template ? { ...template } : null;
	}

	/**
	 * Render a template objective with optional user-provided focus details.
	 */
	renderTemplateObjective(templateIdOrName: string, focus?: string): string {
		const template = this.getTemplate(templateIdOrName);
		if (!template) {
			throw new Error(`Unknown goal template: ${templateIdOrName}`);
		}

		const trimmedFocus = focus?.trim();
		if (!trimmedFocus) {
			return template.objective;
		}

		return `${template.objective}\n\nFocus:\n${trimmedFocus}`;
	}

	/**
	 * Create a goal from a predefined template.
	 */
	createGoalFromTemplate(templateIdOrName: string, focus?: string, tokenBudget?: number): Goal {
		return this.createGoal(this.renderTemplateObjective(templateIdOrName, focus), tokenBudget);
	}

	/**
	 * Get the current goal
	 */
	getGoal(): Goal | null {
		return this.goal;
	}

	/**
	 * Update goal status
	 */
	updateGoalStatus(status: GoalStatus): Goal | null {
		if (!this.goal) {
			throw new Error("No goal exists to update");
		}

		// Validate status transition
		if (!this.isValidTransition(this.goal.status, status)) {
			throw new Error(
				`Invalid status transition from ${this.goal.status} to ${status}`,
			);
		}

		this.goal.status = status;
		this.goal.updatedAt = Date.now();

		return this.goal;
	}

	/**
	 * Update goal objective.
	 * Large objectives (>4000 chars) are stored transparently in GOAL.md.
	 */
	updateObjective(objective: string): Goal | null {
		if (!this.goal) {
			throw new Error("No goal exists to update");
		}

		const trimmedObjective = objective.trim();
		if (!trimmedObjective) {
			throw new Error("Goal objective cannot be empty");
		}

		this.goal.objective = this.storeObjective(trimmedObjective);
		this.goal.updatedAt = Date.now();

		return this.goal;
	}

	/**
	 * Update token budget
	 */
	updateTokenBudget(tokenBudget: number): Goal | null {
		if (!this.goal) {
			throw new Error("No goal exists to update");
		}

		if (tokenBudget <= 0) {
			throw new Error("Token budget must be positive");
		}

		this.goal.tokenBudget = tokenBudget;
		this.goal.updatedAt = Date.now();

		// Check if already over budget
		if (this.goal.tokensUsed >= tokenBudget) {
			this.goal.status = "budget_limited";
		}

		return this.goal;
	}

	/**
	 * Clear the current goal
	 */
	clearGoal(): void {
		this.goal = null;
	}

	/**
	 * Account token usage
	 */
	accountUsage(tokens: number): void {
		if (!this.goal || this.goal.status !== "active") {
			return;
		}

		this.goal.tokensUsed += tokens;
		this.goal.updatedAt = Date.now();

		// Check budget limit
		if (this.goal.tokenBudget && this.goal.tokensUsed >= this.goal.tokenBudget) {
			this.goal.status = "budget_limited";
		}
	}

	/**
	 * Check if goal is in a terminal state
	 */
	isTerminal(status: GoalStatus): boolean {
		return TERMINAL_STATUSES.includes(status);
	}

	/**
	 * Validate status transition
	 */
	private isValidTransition(from: GoalStatus, to: GoalStatus): boolean {
		// Allow same status
		if (from === to) return true;

		// From active: can go to paused, blocked, complete, budget_limited
		if (from === "active") {
			return ["paused", "blocked", "complete", "budget_limited"].includes(to);
		}

		// From paused: can go to active
		if (from === "paused") {
			return to === "active";
		}

		// From blocked: can go to active (user override)
		if (from === "blocked") {
			return to === "active";
		}

		// From budget_limited: can go to active (user override) or complete
		if (from === "budget_limited") {
			return to === "active" || to === "complete";
		}

		// Terminal statuses cannot transition
		return false;
	}

	/**
	 * Load goal state from session
	 */
	async loadFromSession(sessionManager: SessionManager): Promise<void> {
		this.goal = null;
		this.nextGoalId = 1;

		// Scan session-level custom entries and use the latest goal entry. Prefer
		// getEntries() for reload-safe extension persistence; fall back to getBranch()
		// for older Pi runtimes.
		const entries = typeof (sessionManager as any).getEntries === "function"
			? (sessionManager as any).getEntries()
			: sessionManager.getBranch();
		for (const entry of entries) {
			if (entry.type !== "custom" || entry.customType !== "telos:goal") {
				continue;
			}

			const goalData = entry.data as Goal | null;
			if (!goalData) {
				this.goal = null;
				continue;
			}

			this.goal = goalData;
			const parsedId = Number.parseInt(goalData.id?.split("-")[1] || "", 10);
			if (Number.isFinite(parsedId)) {
				this.nextGoalId = Math.max(this.nextGoalId, parsedId + 1);
			}
		}
	}

	/**
	 * Persist goal state to session
	 */
	async persistToSession(pi: { appendEntry?: (customType: string, data?: unknown) => void } | undefined): Promise<boolean> {
		if (typeof pi?.appendEntry !== "function") {
			return false;
		}

		pi.appendEntry("telos:goal", this.goal);
		return true;
	}

	/**
	 * Get goal statistics
	 */
	getStats(): { tokensUsed: number; timeUsedSeconds: number; budgetRemaining?: number } | null {
		if (!this.goal) {
			return null;
		}

		return {
			tokensUsed: this.goal.tokensUsed,
			timeUsedSeconds: this.goal.timeUsedSeconds,
			budgetRemaining: this.goal.tokenBudget
				? Math.max(0, this.goal.tokenBudget - this.goal.tokensUsed)
				: undefined,
		};
	}

	// ==================== Transparent Objective Storage ====================

	/**
	 * Store an objective, using GOAL.md transparently for large content.
	 * Returns the stored objective string (either the content or a file reference).
	 */
	private storeObjective(content: string): string {
		if (content.length > MAX_OBJECTIVE_CHARS) {
			const goalFilePath = join(process.cwd(), "GOAL.md");
			this.writeGoalFile(goalFilePath, content);
			return `${FILE_OBJECTIVE_PREFIX}${goalFilePath}`;
		}
		return content;
	}

	// ==================== Goal File Editing ====================

	/**
	 * Resolve a file reference in the objective.
	 * If objective starts with "file:", returns the content of that file.
	 * Otherwise returns the objective as-is.
	 */
	resolveFileReference(objective: string): string {
		const trimmed = objective.trim();
		if (trimmed.startsWith(FILE_OBJECTIVE_PREFIX) && trimmed.length > FILE_OBJECTIVE_PREFIX.length) {
			const filePath = trimmed.slice(FILE_OBJECTIVE_PREFIX.length).trim();
			return this.readGoalFile(filePath);
		}
		return trimmed;
	}

	/**
	 * Check if the current goal has a file reference.
	 */
	hasFileReference(): boolean {
		if (!this.goal) return false;
		return this.goal.objective.trim().startsWith(FILE_OBJECTIVE_PREFIX);
	}

	/**
	 * Get the file path if the current goal uses file reference.
	 */
	getFileReferencePath(): string | null {
		if (!this.goal) return null;
		const trimmed = this.goal.objective.trim();
		if (trimmed.startsWith(FILE_OBJECTIVE_PREFIX) && trimmed.length > FILE_OBJECTIVE_PREFIX.length) {
			return trimmed.slice(FILE_OBJECTIVE_PREFIX.length).trim();
		}
		return null;
	}

	/**
	 * Read a goal file and return its content.
	 */
	readGoalFile(filePath: string): string {
		if (!existsSync(filePath)) {
			throw new Error(`Goal file not found: ${filePath}`);
		}
		return readFileSync(filePath, "utf-8").trim();
	}

	/**
	 * Write objective content to a goal file.
	 * Returns the file path.
	 */
	writeGoalFile(filePath: string, content: string): string {
		const dir = filePath.split("/").slice(0, -1).join("/");
		if (dir && !existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		writeFileSync(filePath, content, "utf-8");
		return filePath;
	}

	/**
	 * Write the current goal's objective to a temporary file for editing.
	 * Returns the temp file path.
	 */
	writeGoalToTempFile(): string {
		if (!this.goal) {
			throw new Error("No goal exists to edit");
		}
		const tempPath = join(tmpdir(), `telos-goal-${this.goal.id}.md`);
		writeFileSync(tempPath, this.goal.objective, "utf-8");
		return tempPath;
	}

	/**
	 * Read edited content from a file and save it as the new objective.
	 * Large content is stored transparently in GOAL.md.
	 */
	loadGoalFromFile(filePath: string): void {
		if (!this.goal) {
			throw new Error("No goal exists to update");
		}

		const content = this.readGoalFile(filePath);
		if (!content) {
			throw new Error("Goal file is empty");
		}

		this.goal.objective = this.storeObjective(content);

		// Validate the objective
		const trimmed = this.goal.objective.trim();
		if (trimmed === FILE_OBJECTIVE_PREFIX || trimmed.startsWith(FILE_OBJECTIVE_PREFIX)) {
			// It's a file reference — resolve to validate the actual content
			const resolved = this.resolveFileReference(trimmed);
			if (!resolved) {
				throw new Error("File reference resolves to empty content");
			}
		} else if (!trimmed) {
			throw new Error("Goal objective cannot be empty");
		}

		this.goal.updatedAt = Date.now();
	}

	/**
	 * Open an editor for the current goal and update it with the edited content.
	 * Large objectives are stored transparently in GOAL.md.
	 * Returns the updated goal.
	 * @param editor - Editor command to use (defaults to EDITOR env var or 'nano')
	 */
	async editGoal(editor?: string): Promise<Goal> {
		if (!this.goal) {
			throw new Error("No goal exists to edit");
		}

		const editorCmd = editor || process.env.EDITOR || "nano";
		let tempFile: string | null = null;

		try {
			// Write current objective to temp file
			tempFile = this.writeGoalToTempFile();

			// Open the editor (use spawn to launch external editor)
			const { spawn } = await import("node:child_process");
			const [cmd, ...args] = editorCmd.split(/\s+/);

			await new Promise<void>((resolve, reject) => {
				const proc = spawn(cmd, [...args, tempFile!], {
					stdio: "inherit",
				});
				proc.on("close", (code) => {
					if (code === 0) {
						resolve();
					} else {
						reject(new Error(`Editor exited with code ${code}`));
					}
				});
				proc.on("error", reject);
			});

			// Load the edited content from the temp file
			this.loadGoalFromFile(tempFile);

			return this.goal;
		} finally {
			// Clean up temp file
			if (tempFile) {
				try {
					unlinkSync(tempFile);
				} catch {
					// Ignore cleanup errors
				}
			}
		}
	}
}