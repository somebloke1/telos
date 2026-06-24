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

- [ ] **Goal Chain Widget**
  - Display active goal chain status with rich detail
  - Show primary goal and generation in a dedicated widget
  - Sub-goal progress visualization (not just count)
  - Quick access to chain details via click/hover

- [ ] **Evolution Visualization**
  - Show reproductive clause version with mutation history
  - Display learnings count and key learnings
  - Generation progression indicator
  - Visual timeline of chain evolution

- [ ] **Enhanced Goal Display**
  - Syntax highlighting for objectives
  - Better formatting for long objectives
  - Collapsible sections for details
  - Timestamp formatting

### Documentation
- [ ] Update README with TUI integration screenshots
- [ ] Add TUI section to EXAMPLES.md
- [ ] Document TUI-specific features

## Version 0.4.0 - Goal Editing & Files

### Priority 1 Features
- [ ] **`/goal edit` Command**
  - Open editor to modify objective
  - Support for large objectives (>4000 chars)
  - Write to file when too long
  - Automatic file reference handling

- [ ] **Goal File Support**
  - Read objectives from GOAL.md files
  - Edit goal files directly
  - Auto-detect goal files in project
  - Support markdown formatting in objectives

- [ ] **Objective Templates**
  - Predefined goal templates
  - Template categories (development, testing, documentation)
  - Custom template creation
  - Template management commands

- [ ] **Reproductive Clause Editing**
  - Edit primary goal conservatively
  - Modify essential principles
  - Update mutation guidelines
  - Version history tracking

### Documentation
- [ ] Goal editing guide
- [ ] Template documentation
- [ ] File-based objective examples

## Version 0.5.0 - Enhanced Continuation

### Priority 2 Features
- [ ] **Smart Continuation**
  - Context-aware continuation prompts
  - Variable continuation frequency
  - Adaptive continuation based on progress
  - Intelligent continuation triggering

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
| 0.3.0 | 2026-06-24 | 🚧 In Progress (TUI footer complete, widget & evolution pending) |
| 0.4.0 | TBD | 📋 Planned |
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
**Current Version**: 0.3.0-alpha
**Next Version**: 0.3.0 (Goal Chain Widget, Evolution Visualization)