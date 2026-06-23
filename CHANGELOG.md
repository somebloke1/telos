# Changelog

All notable changes to Telos will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- TUI integration (goal status in footer, widgets)
- `/goal edit` command for modifying objectives
- Goal file support for >4000 char objectives
- Goal templates and presets
- Enhanced continuation strategies
- Goal analytics and reporting

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

[Unreleased]: https://github.com/somebloke1/telos/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/somebloke1/telos/releases/tag/v0.1.0
[0.0.1]: https://github.com/somebloke1/telos/releases/tag/v0.0.1