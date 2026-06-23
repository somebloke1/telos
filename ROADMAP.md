# Telos Roadmap

This document outlines the planned development roadmap for Telos.

## Version 0.2.0 - TUI Integration

### Priority 1 Features
- [ ] **Goal Status in TUI Footer**
  - Show current goal status (active/paused/etc.)
  - Display objective preview (truncated if long)
  - Show token budget progress bar
  - Click to view full goal details

- [ ] **Goal Widget**
  - Dedicated widget showing goal information
  - Status icon with color coding
  - Progress indicators
  - Quick action buttons (pause/resume/clear)

- [ ] **Enhanced Goal Display**
  - Syntax highlighting for objectives
  - Better formatting for long objectives
  - Collapsible sections for details
  - Timestamp formatting

### Documentation
- [ ] Update README with TUI integration screenshots
- [ ] Add TUI section to EXAMPLES.md
- [ ] Document TUI-specific features

## Version 0.3.0 - Goal Editing & Files

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

### Documentation
- [ ] Goal editing guide
- [ ] Template documentation
- [ ] File-based objective examples

## Version 0.4.0 - Enhanced Continuation

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

- [ ] **Progress Tracking**
  - Track progress toward goal completion
  - Milestone tracking
  - Progress visualization
  - Completion estimation

### Documentation
- [ ] Continuation strategies guide
- [ ] Progress tracking features
- [ ] Configuration options

## Version 0.5.0 - Analytics & Reporting

### Priority 2 Features
- [ ] **Goal Statistics**
  - Time tracking per goal
  - Token usage analytics
  - Turn count tracking
  - Completion rate statistics

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

## Version 1.0.0 - Multi-Goal & Advanced Features

### Priority 3 Features
- [ ] **Multi-Goal Support**
  - Multiple active goals
  - Goal prioritization
  - Goal dependencies
  - Goal grouping

- [ ] **Advanced Budgeting**
  - Time budgets
  - Turn count limits
  - Per-tool budgets
  - Budget inheritance

- [ ] **Integration Features**
  - GitHub issue → goal conversion
  - Project file scanning for goals
  - Goal sharing between sessions
  - Goal templates from issues

- [ ] **Goal Collaboration**
  - Share goals with team
  - Goal comments and notes
  - Goal assignment
  - Team goal boards

### Documentation
- [ ] Multi-goal usage guide
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

## Version Timeline

| Version | Target Release | Status |
|---------|---------------|--------|
| 0.1.0 | 2026-06-23 | ✅ Released |
| 0.2.0 | TBD | 🔄 Planning |
| 0.3.0 | TBD | 📋 Planned |
| 0.4.0 | TBD | 📋 Planned |
| 0.5.0 | TBD | 📋 Planned |
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

- Multi-goal support (v1.0.0) depends on enhanced goal management
- Advanced analytics (v0.5.0) depends on basic statistics (v0.4.0)
- Goal templates (v0.3.0) enhance goal editing (v0.3.0)

## Breaking Changes

We aim to minimize breaking changes, but some may be necessary:

- v1.0.0 may introduce breaking changes for multi-goal support
- Major version bumps will include migration guides

## Feedback Loop

We use this roadmap to guide development, but prioritize based on:

- User feedback and demand
- Technical feasibility
- Maintenance burden
- Strategic alignment

Your feedback helps us prioritize! Join the discussion in GitHub issues.

---

**Last Updated**: 2026-06-23
**Current Version**: 0.1.0
**Next Version**: 0.2.0 (Planning)