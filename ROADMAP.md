# Telos Roadmap

This document outlines the planned development roadmap for Telos.

## [0.2.0] - Released

### Goal Chains (Evolutionary Goal Management)
- [x] **Reproductive Clause System**
  - Primary goal with essential principles
  - Mutation guidelines for conservative evolution
  - Invariant constraints that must be preserved
  - Lifeline caching for recovery

- [x] **Sub-Goal Management**
  - Hierarchical decomposition of primary goals
  - Status tracking: pending, active, complete, blocked
  - Learnings collection from completed sub-goals
  - Token budget tracking per sub-goal

- [x] **Record Space**
  - Accumulation of goal events and learnings
  - Pattern recognition for inference
  - Mutation history and reasoning
  - Success/failure tracking

- [x] **Evolutionary Mechanisms**
  - Conservative mutation of reproductive clause
  - Multi-generational goal evolution
  - Learnings-driven adaptation
  - Non-deterministic model generations

- [x] **User Commands**
  - `/goalchain create <primary_goal>` - Create new chain
  - `/goalchain list` - List all chains
  - `/goalchain show <id>` - View chain details
  - `/goalchain infer <id>` - Infer sub-goals
  - `/goalchain delete <id>` - Delete chain

- [x] **LLM Tools**
  - `get_goal_chain` - Retrieve chain information
  - `create_goal_chain` - Create new chain
  - `add_sub_goals` - Add sub-goals
  - `update_sub_goal_status` - Update with learnings
  - `mutate_reproductive_clause` - Evolve chain
  - `infer_sub_goals` - Infer from record space

### Documentation
- [x] Updated README with goal chain examples
- [x] Added evolutionary concepts explanation
- [x] Documented single goals vs goal chains
- [x] Advanced features section

## Version 0.3.0 - TUI Integration

### Priority 1 Features
- [x] **Goal Status in TUI Footer** (v0.3.0-alpha)
  - Compact status codes: `[A]` active, `[P]` paused, `[B]` blocked, `[✓]` complete, `[⌀]` budget_limited
  - Chain status codes: `⚡` active, `⏸` paused, `✓` complete, `⟳` evolving
  - Truncated chain primary goals (30 char max) to prevent footer domination
  - Sub-goal progress indicator: e.g., `"2/5 done · 1 active"`
  - Generation tracking display for multi-gen chains
  - Clean dual-bar layout: `[A] objective[budget]  |  ⚡ chain [progress]`
  - Helper functions exported for testability: `truncate`, `formatSubGoalProgress`, `STATUS_CODES`, `CHAIN_STATUS_CODES`
  - 15 unit tests for footer helpers (74 total test suite)

- [x] **Goal Chain Widget** (v0.3.0-beta)
  - `renderChainWidget()` displays active chain with rich detail
  - Chain header with truncated primary goal (30 chars)
  - Sub-goal breakdown: `10/20 done · 5 active · 3 blocked · 2 pending`
  - Evolution symbols: ⊕N (clause version), gN (generation), ℒN (learnings)
  - Actionable sub-goals preview (up to 2)
  - Recent learnings preview (truncated at 80 chars)
  - Integration into footer alongside goal status bar

- [x] **Evolution Visualization** (v0.3.0-beta)
  - `formatEvolutionInfo()` renders compact symbols: ⊕N, gN, ℒN
  - Integrated into chain status display
  - `EVOLUTION_SYMBOLS` exported for testability
  - 4 unit tests for evolution info formatting

- [x] **Enhanced Goal Display**
  - ANSI color codes for status highlighting (green/yellow/red/cyan/bright/gray)
  - `COLORS`, `STATUS_COLORS`, `CHAIN_STATUS_COLORS` objects
  - `colorize()`, `colorizeStatus()`, `colorizeChainStatus()`, `getStatusColor()` helpers
  - 10 unit tests for color functions
  - 15 unit tests for TUI footer helpers
  - 7 `renderChainWidget` tests

### Documentation
- [x] Updated README with TUI Integration section
  - Goal status footer codes ([A],[P],[B],[✓],[⌀])
  - Goal chain widget documentation
  - Evolution symbols table
  - Colorized status integration
- [x] Added `/goal edit` command to README and quick reference
- [ ] Add TUI section to EXAMPLES.md
- [ ] Document TUI-specific features

## Version 0.4.0 - Goal Editing & Files

### Priority 1 Features
- [x] **`/goal edit` Command** (v0.4.0-alpha)
  - Open editor to modify objective via `$EDITOR`
  - Transparent large objective handling (>4000 chars auto-stored in GOAL.md)
  - Automatic file reference resolution (user never sees `file:` prefix)
  - `GoalManager.storeObjective()` for transparent large-content storage
  - No `--file` flag needed — file operations are invisible to the user
  - `GoalManager.editGoal()` removed `useFileReference` parameter

- [x] **Goal File Support** (v0.4.0-alpha)
  - `storeObjective(content)` auto-writes to GOAL.md when content > 4000 chars
  - `resolveFileReference()` reads from GOAL.md transparently
  - `GoalManager.createGoal()` handles large objectives transparently
  - `GoalManager.loadGoalFromFile()` auto-detects large content
  - User interacts with `/goal <objective>`, `/goal edit`, `/goal show` — no file awareness needed

- [x] **Objective Templates** (v0.4.0-alpha)
  - Predefined goal templates in `GoalManager`: development, testing, documentation, refactoring
  - `/goal template list` command
  - `/goal template use <id> [focus]` command with replacement confirmation and continuation trigger
  - Template rendering preserves transparent large-objective storage through existing `GOAL.md` handling
  - Custom template creation remains future work

- [ ] **Reproductive Clause Editing**
  - Edit primary goal conservatively
  - Modify essential principles
  - Update mutation guidelines
  - Version history tracking

- [x] **Session Validation** (v0.4.0-alpha)
  - `GoalChainManager.validateEntry()` for structured diagnostics
  - Schema version checking (below/above current version)
  - Per-chain validation: id, primaryGoal, reproductive clause required
  - Graceful degradation: `loadFromSession()` skips invalid chains, rejects old schemas
  - Enhanced `/goalchain diagnose` with validation output
  - 6 new validation tests (142 total)

- [x] **Goal Chain Cognitive Metabolism** (v0.4.0-alpha)
  - Hot/Warm/Cold memory tiers for normal chain operation
  - Deterministic context entropy metrics: objective chars, record chars, oversized sub-goals, inferred context dumps, raw record count
  - `compactGoalChain()` distills history into warm-memory summaries without deleting cold details
  - Bounded `buildInferenceContext()` avoids embedding full historical walls in inferred sub-goal objectives
  - `/goalchain compact <id>` and `compact_goal_chain` tool for routine maintenance
  - `/goalchain detail <id> <sub_goal_id>` and `get_sub_goal_detail` tool for cold-memory lookup
  - Centralized `TelosConfig` abstraction for future migration of static values into configuration
  - Configurable curator metadata path for local Ollama/Snowflake embeddings (`TELOS_CURATOR_*`)
  - Curator/distiller cooperation spec recorded in `docs/goal-chain-curator-distiller-spec.md` without depending on transient goal-chain IDs
  - Async provider-neutral distiller path for reproductive-clause mutation (`TELOS_DISTILLER_*`)
  - `ChatCompletionGoalChainDistiller` supports OpenAI-compatible endpoints such as LiteLLM without naming the architecture after a provider target
  - Automatic mutation is skipped and recorded when no equivalent distiller is configured; no deterministic/mock LLM substitute is used
  - 15 new tests (163 total)

### Documentation
- [x] Updated README with TUI Integration section
- [x] Added configuration documentation for curator model/host abstraction and async distiller settings
- [ ] Goal editing guide
- [ ] Template documentation
- [ ] File-based objective examples

## Version 0.5.0 - Enhanced Continuation

### Priority 2 Features
- [x] **Smart Continuation** (v0.5.0-alpha)
  - Context-aware continuation prompts with strategy, budget, context usage, and next-step guidance
  - Variable continuation frequency using adaptive intervals
  - Conservative cadence when token budget is mostly consumed
  - Handoff-oriented guidance when context usage is high
  - Tests for initial, budget-conservative, context-handoff, and throttled continuation plans
- [x] **Continuation-halt fix** (v0.5.0-alpha)
  - Fixed auto-continuation silently stopping on turn boundaries when the user was away from the keyboard (continuations are now delivered as `followUp` so they survive Pi's `turn_end` streaming window)
  - Chain continuation no longer self-terminates when no sub-goals are queued; the model steers toward evolving at a more basic level via reproductive-clause mutation

- [ ] **Continuation Strategies**
  - Multiple continuation modes (aggressive, balanced, conservative)
  - User-configurable continuation settings
  - Continuation history and analytics
  - Continuation undo capability

- [ ] **Chain-Aware Continuation**
  - Sub-goal focused continuation
  - Generation-aware prompts
  - Learnings integration
  - Evolutionary steering

- [ ] **Progress Tracking**
  - Track progress toward goal completion
  - Milestone tracking
  - Progress visualization
  - Completion estimation

### Documentation
- [ ] Continuation strategies guide
- [ ] Progress tracking features
- [ ] Configuration options

## Version 0.6.0 - Analytics & Reporting

### Priority 2 Features
- [ ] **Goal Statistics**
  - Time tracking per goal
  - Token usage analytics
  - Turn count tracking
  - Completion rate statistics

- [ ] **Goal Chain Analytics**
  - Generation-by-generation analysis
  - Mutation effectiveness tracking
  - Learning quality assessment
  - Evolution trajectory visualization

- [ ] **Usage Reports**
  - Per-session goal reports
  - Historical goal data
  - Performance metrics
  - Cost analysis

- [ ] **Goal History**
  - View all past goals
  - Goal comparison
  - Search and filter
  - Export capabilities

### Documentation
- [ ] Analytics features guide
- [ ] Reporting documentation
- [ ] Metrics explanation

## Version 1.0.0 - Advanced Goal Chains & Multi-Chain

### Priority 3 Features
- [ ] **Multi-Chain Management**
  - Multiple concurrent goal chains
  - Chain dependencies and coordination
  - Cross-chain learnings transfer
  - Chain merging and splitting

- [ ] **Advanced Evolution**
  - Adaptive mutation rates
  - Confidence-based evolution
  - Rollback capabilities
  - Branching evolution paths

- [ ] **Enhanced Inference**
  - Machine learning-based pattern recognition
  - Predictive sub-goal suggestion
  - Automated constraint detection
  - Success probability estimation

- [ ] **Advanced Budgeting**
  - Time budgets per chain/sub-goal
  - Turn count limits
  - Per-tool budgets
  - Budget inheritance across generations

- [ ] **Integration Features**
  - GitHub issue → goal chain conversion
  - Project file scanning for goals
  - Goal chain sharing between sessions
  - Goal templates from issues

- [ ] **Goal Collaboration**
  - Share goal chains with team
  - Chain comments and notes
  - Collaborative evolution
  - Team chain boards

### Documentation
- [ ] Multi-chain usage guide
- [ ] Advanced features documentation
- [ ] Integration guide
- [ ] Collaboration features

## Future Considerations

### Potential Features
- [ ] Goal-based session templates
- [ ] Goal automation rules
- [ ] Goal notifications
- [ ] Goal webhooks
- [ ] Goal API for external tools
- [ ] Goal machine learning (auto-categorization, suggestions)
- [ ] Goal performance optimization
- [ ] Goal security features (encryption, access control)

### Research Areas
- [ ] Optimal continuation timing
- [ ] Goal objective summarization
- [ ] Goal priority algorithms
- [ ] Token budget prediction
- [ ] Goal completion prediction
- [ ] Evolutionary mutation strategies
- [ ] Learning quality assessment

## Version Timeline

| Version | Target Release | Status |
|---------|---------------|--------|
| 0.1.0 | 2026-06-23 | ✅ Released |
| 0.2.0 | 2026-06-23 | ✅ Released |
| 0.3.0 | 2026-06-24 | ✅ TUI footer complete, Goal Chain Widget & Evolution Visualization complete |
| 0.4.0 | TBD | 🚧 In Progress (/goal edit, Goal File Support, Session Validation) |
| 0.5.0 | TBD | 📋 Planned |
| 0.6.0 | TBD | 📋 Planned |
| 1.0.0 | TBD | 📋 Planned |

## Contributing to Roadmap

Want to help shape Telos's future? Here's how:

1. **Vote on Features**: Comment on issue priorities
2. **Propose Features**: Create feature requests with use cases
3. **Implement Features**: Pick an item and contribute!
4. **Provide Feedback**: Share your experience and suggestions

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Priority Definitions

- **Priority 1**: Core functionality that enhances the main use case
- **Priority 2**: Features that improve usability and provide additional value
- **Priority 3**: Advanced features for power users and special cases

## Dependencies

Some features depend on others:

- Multi-chain support (v1.0.0) depends on enhanced goal management
- Advanced analytics (v0.6.0) depends on basic statistics (v0.5.0)
- Goal templates (v0.4.0) enhance goal editing (v0.4.0)
- Chain-aware continuation (v0.5.0) depends on goal chains (v0.2.0)

## Breaking Changes

We aim to minimize breaking changes, but some may be necessary:

- v1.0.0 may introduce breaking changes for multi-chain support
- Major version bumps will include migration guides

## Feedback Loop

We use this roadmap to guide development, but prioritize based on:

- User feedback and demand
- Technical feasibility
- Maintenance burden
- Strategic alignment

Your feedback helps us prioritize! Join the discussion in GitHub issues.

---

**Last Updated**: 2026-06-24
**Current Version**: 0.4.0-alpha
**Next Version**: 0.4.0 (Objective Templates, Reproductive Clause Editing)