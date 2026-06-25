# Changelog

All notable changes to Telos will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (v0.4.0-alpha)
- **Goal Chain Cognitive Metabolism** (`src/goal-chain.ts`)
  - Added deterministic context entropy metrics: objective chars, record chars, oversized sub-goals, inferred context dumps, raw record count, completed count
  - Added `compactGoalChain()` to distill cold record history into warm-memory summaries while preserving full sub-goal detail
  - Added `GoalChainContextSummary` with completed summary, stable learnings, recent learnings, archived sub-goal IDs, and curator metadata
  - Added bounded `buildInferenceContext()` using Hot/Warm/Cold memory tiers instead of dumping all completed goals into inferred objectives
  - Inferred sub-goal objectives now stay compact and reference warm memory instead of embedding full historical context
  - `/goalchain show` now displays compact chain summaries with detail lookup hints
- **Cold-Memory Lookup**
  - Added `get_sub_goal_detail` LLM tool for full objective, records, and learnings of a specific sub-goal
  - Added `/goalchain detail <chain_id> <sub_goal_id>` command
  - Added `/goalchain compact <chain_id>` command and `compact_goal_chain` LLM tool for normal maintenance operation
- **Async Reproductive-Clause Distillation** (`src/goal-chain.ts`, `src/goal-chain-distiller.ts`)
  - Added provider-neutral `GoalChainDistiller` interface and `ChatCompletionGoalChainDistiller` for OpenAI-compatible chat-completion endpoints
  - Removed automatic synchronous keyword/pattern principle extraction from sub-goal status updates
  - Added `updateSubGoalStatusAsync()` and `maybeEvolveChainAsync()` so production evolution is gated by configured async distillation
  - If no equivalent distiller is configured or a distiller fails, automatic mutation is skipped and recorded as `distillation_skipped`; Telos does not substitute deterministic/mock LLM logic
- **Centralized Configuration** (`src/config.ts`)
  - Added app-level `TelosConfig` and merge/env resolution helpers so static values can migrate into configuration over time
  - Added configurable curator surface: `TELOS_CURATOR_ENABLED`, `TELOS_CURATOR_PROVIDER`, `TELOS_CURATOR_HOST`, `TELOS_CURATOR_MODEL`, `TELOS_CURATOR_TOP_K`, `TELOS_CURATOR_TIMEOUT_MS`, `TELOS_CURATOR_ANCHOR_FILES`
  - Added provider-neutral distiller surface: `TELOS_DISTILLER_ENABLED`, `TELOS_DISTILLER_PROVIDER`, `TELOS_DISTILLER_MODEL`, `TELOS_DISTILLER_BASE_URL`, `TELOS_DISTILLER_API_KEY_ENV`, `TELOS_DISTILLER_TIMEOUT_MS`, `TELOS_DISTILLER_MAX_PRINCIPLES`
  - Default curator model is `snowflake-arctic-embed2:latest`; default distiller model is `litellm/codex/gpt-5.4` behind an OpenAI-compatible endpoint
- **Objective Templates** (`src/goal-manager.ts`, `src/index.ts`)
  - Added predefined development, testing, documentation, and refactoring templates
  - Added `/goal template list` and `/goal template use <id> [focus]` commands
  - Template-created goals reuse transparent large-objective storage and normal continuation behavior
- **Smart Continuation** (`src/goal-continuation.ts`)
  - Added adaptive continuation plans with initial, steady, budget-conservative, and context-handoff strategies
  - Continuation prompts now include strategy, cadence, token budget state, context pressure, and next-step guidance
  - Automatic continuation throttles based on budget consumption and context usage instead of a single fixed interval
- **Expanded Test Suite**
  - 175 tests total
  - Added tests for context entropy metrics, compacted warm memory, bounded chain rendering, compact inference objectives, sub-goal detail lookup, config resolution, no-hidden-substitute distillation behavior, objective templates, and smart continuation

### Added (v0.3.0 - In Development)
- **TUI Footer Enhancements** (`src/tui/footer.ts`)
  - Status codes for goals: `[A]` active, `[P]` paused, `[B]` blocked, `[✓]` complete, `[⌀]` budget_limited
  - Chain status codes: `⚡` active, `⏸` paused, `✓` complete, `⟳` evolving
  - Truncated chain primary goals (30 char max) to avoid dominating footer
  - Sub-goal progress indicator (e.g., `"2/5 done · 1 active"`)
  - Generation tracking display for goal chains
  - Evolution visualization: ⊕N (clause version), gN (generation), ℒN (learnings count)
  - Cleaner dual-bar layout: `[A] objective[budget]  |  ⚡ chain [progress]`
  - Helper functions exported for testability: `truncate`, `formatSubGoalProgress`, `formatEvolutionInfo`, `STATUS_CODES`, `CHAIN_STATUS_CODES`, `EVOLUTION_SYMBOLS`
- **Record Space Mining for Inference** (`src/goal-chain.ts`)
  - Replaced brittle keyword/regex matching with record space mining
  - `buildInferenceContext()` gathers reproductive clause, sub-goal status breakdown, completed/blocked goals with learnings, pending/active goals, and recent record entries
  - LLM receives structured historical context for genuine reasoning
  - Removed dead code: `inferNextStepsFromPrimaryGoal`, `inferIntermediateSteps`, `truncateText` (47 lines)
- **Goal Chain Manager Improvements** (`src/goal-chain.ts`)
  - `getActionableSummary(chain)`: structured summary for TUI widget display including chain id, status, generation, clause version, truncated goal, sub-goal breakdown, progress string, recent learnings, and actionable sub-goals
  - Refactored `inferAlternativeObjective` to use SubGoal+chain signature instead of string+recordSpace
- **GitHub Workflows**
  - Auto CHANGELOG update workflow (`.github/workflows/changelog-update.yml`)
  - Detects latest tag, extracts commits, appends to version section
  - Idempotent: skips if no changes detected
- **Expanded Test Suite**
  - 86 tests total (up from 59)
  - New inference tests: record space mining, alternative objectives, deduplication
  - New actionable summary tests: full chain, empty chain, inferred sub-goals
  - New evolution visualization tests: clause version, generation, learnings count
  - Static analysis tests for source code structure verification
- **Documentation**
  - ROADMAP.md updated: v0.3.0-alpha progress documented
  - Version timeline updated to reflect current state
- **Bug Fixes**
  - Fixed `addToRecordSpace` to use `resolvedId` instead of raw `subGoalId`
  - Removed dead code (`injectBudgetLimitSteering`, `injectObjectiveUpdatedSteering`)
  - Added `MIN_CONTINUATION_INTERVAL <= 0` guard against thundering herd
  - Removed stale completion-audit comment from continuation messages
  - Removed duplicate `inferAlternativeObjective` method signature

### Planned (v0.4.0)
- `/goal edit` command for modifying objectives
- Goal file support for >4000 char objectives
- Goal templates and presets
- Enhanced continuation strategies
- Goal analytics and reporting
- Goal Chain Widget (advanced TUI display)
- Evolution Visualization in TUI

## [0.1.0] - 2026-06-23

### Added
- Initial implementation of `/goal` functionality
- GoalManager: state management and persistence
- GoalTools: LLM-facing tools (get_goal, create_goal, update_goal)
- GoalContinuation: automatic continuation when goal is active
- User commands: `/goal`, `/goal pause`, `/goal resume`, `/goal clear`
- Five goal statuses: active, paused, blocked, complete, budget_limited
- Token budget tracking and enforcement
- Session-based persistence
- Comprehensive documentation (README, TESTING, EXAMPLES, DESIGN)
- GitHub workflows for validation and type checking
- Issue and pull request templates
- Code of Conduct and Security Policy

### Features
- Set persistent objectives for Pi sessions
- Automatic continuation when goal is active and session is idle
- Token budget tracking to control costs
- Goal status management with proper validation
- LLM tools for goal inspection and updates
- Session persistence across Pi restarts

### Documentation
- README.md with installation and usage instructions
- TESTING.md with comprehensive test procedures
- EXAMPLES.md with real-world usage examples
- DESIGN.md with architecture and design decisions
- CONTRIBUTING.md with contribution guidelines
- docs/research/codex_goal_feature_research.md with implementation research

### Project Setup
- Git repository with main, dev, and feature branches
- GitHub repository: https://github.com/somebloke1/telos
- MIT License
- TypeScript implementation
- Package.json with Pi extension configuration

## [0.0.1] - 2026-06-23

### Added
- Project initialization
- Research document for Codex goal feature
- Initial project structure

---

[Unreleased]: https://github.com/somebloke1/telos/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/somebloke1/telos/releases/tag/v0.2.0
[0.1.0]: https://github.com/somebloke1/telos/releases/tag/v0.1.0
[0.0.1]: https://github.com/somebloke1/telos/releases/tag/v0.0.1