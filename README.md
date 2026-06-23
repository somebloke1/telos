# Telos

> *Telos: Greek for "purpose, end, or goal"*

A Pi Coding Assistant extension that brings `/goal` functionality to Pi, inspired by Codex's persistent thread goal feature.

## Overview

Telos adds persistent goal tracking to your Pi sessions. Goals help you stay focused on long-running tasks by:

- Providing a persistent objective that persists across turns
- Automatically continuing work when the session becomes idle
- Tracking token usage and budget limits
- Giving the LLM explicit goal-aware tools and context

## Features

### User Commands

- `/goal <objective>` - Set a new goal for the session
- `/goal` - View the current goal and its status
- `/goal pause` - Pause the current goal (stops automatic continuation)
- `/goal resume` - Resume a paused goal
- `/goal clear` - Remove the current goal

### LLM Tools

- `get_goal` - Retrieve the current goal, its status, and usage statistics
- `create_goal` - Create a new goal (only when no unfinished goal exists)
- `update_goal` - Update goal status to "complete" or "blocked"

### Automatic Continuation

When a goal is active, Telos automatically triggers continuation turns when the session becomes idle. This keeps the LLM working toward the goal without manual intervention.

### Token Budget Tracking

Set optional token budgets on goals to limit resource usage. Telos tracks token consumption and warns when approaching or exceeding the budget.

## Installation

### Local Development

Clone and use directly:

```bash
cd /path/to/telos
pi -e ./src/index.ts
```

### Global Installation

Copy to your global extensions directory:

```bash
cp -r telos ~/.pi/agent/extensions/
# Then simply run
pi
```

### Project-Local Installation

Copy to your project's `.pi` directory:

```bash
cp -r telos .pi/extensions/
```

## Usage

### Basic Example

```
You: /goal Implement a REST API for user management

Assistant: Goal set successfully.

You: Create a User model with fields: id, name, email, created_at

Assistant: [Creates User model]

You: [Session becomes idle...]

Assistant: [Automatically continues] I'll continue working on the REST API for user management...
[Proceeds to implement controllers, routes, etc.]
```

### With Token Budget

```
You: /goal Refactor the authentication module (budget: 10000 tokens)

Assistant: Goal set successfully.

[... work proceeds ...]

Assistant: [When budget is reached] BUDGET LIMIT REACHED: The token budget for this goal has been exhausted.
```

### Pausing and Resuming

```
You: /goal pause
Assistant: Goal paused

[... do other work ...]

You: /goal resume
Assistant: Goal resumed
```

## Goal Statuses

- **active** - Goal is in progress, automatic continuation is enabled
- **paused** - Goal is suspended by user, no automatic continuation
- **blocked** - Goal cannot proceed (marked by LLM)
- **complete** - Goal has been achieved (marked by LLM)
- **budget_limited** - Token budget has been exhausted

## Architecture

Telos is structured as a TypeScript Pi extension with three main modules:

- **GoalManager** (`goal-manager.ts`) - Manages goal state and persistence
- **GoalTools** (`goal-tools.ts`) - Implements LLM-facing goal tools
- **GoalContinuation** (`goal-continuation.ts`) - Handles automatic continuation logic

### Event Flow

```
/goal command → GoalManager → Session persistence
                    ↓
         Goal state stored in session entries
                    ↓
            LLM tools read/write state
                    ↓
         Continuation checks after each turn
                    ↓
     Auto-trigger continuation when idle + active goal
```

## Research & Design

Telos is based on research of the Codex `/goal` feature from the openai/codex repository (commit d2484697). Key design decisions:

- **Thread-scoped persistence**: Goals are stored per session/thread, similar to Codex's `thread_goals` table
- **Status model**: Mirrors Codex's status enum with Pi-appropriate adjustments
- **Model tools**: LLM can get/create/update goals, but pause/resume remain user-controlled
- **Continuation steering**: Injects context to guide the LLM without full prompt rewriting
- **Budget limits**: Token budgets help control costs for long-running autonomous work

See `docs/research/codex_goal_feature_research.md` for detailed research notes.

## Limitations & Differences from Codex

- No app-server protocol (Pi uses different architecture)
- Goals are session-scoped rather than thread-scoped (Pi's session ≈ Codex's thread)
- No desktop/app UI integration (TUI only)
- Simplified continuation logic (no complex rollout/rollback)
- Goals stored in session entries rather than SQLite

## Contributing

Contributions welcome! Areas for improvement:

- Enhanced goal visualization in TUI
- Goal templates and presets
- Integration with project files (e.g., read objectives from GOAL.md)
- More sophisticated continuation strategies
- Goal analytics and reporting

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE.md](LICENSE.md)

## Acknowledgments

- Inspired by OpenAI Codex's `/goal` feature
- Built with [Pi Coding Agent](https://github.com/earendil-works/pi-mono)
- Research based on [openai/codex](https://github.com/openai/codex) repository

## Author

[@somebloke1](https://github.com/somebloke1)