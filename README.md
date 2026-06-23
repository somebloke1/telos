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

### Single Goals

#### User Commands

- `/goal <objective>` - Set a new goal for the session
- `/goal` - View the current goal and its status
- `/goal pause` - Pause the current goal (stops automatic continuation)
- `/goal resume` - Resume a paused goal
- `/goal clear` - Remove the current goal

#### LLM Tools

- `get_goal` - Retrieve the current goal, its status, and usage statistics
- `create_goal` - Create a new goal (only when no unfinished goal exists)
- `update_goal` - Update goal status to "complete" or "blocked"

### Goal Chains (Evolutionary Goal Management)

#### User Commands

- `/goalchain create <primary_goal>` - Create a new evolutionary goal chain
- `/goalchain list` - List all goal chains
- `/goalchain show <id>` - View detailed information about a goal chain
- `/goalchain infer <id>` - Infer sub-goals from record space
- `/goalchain delete <id>` - Delete a goal chain

#### LLM Tools

- `get_goal_chain` - Retrieve goal chain information including reproductive clause and sub-goals
- `create_goal_chain` - Create a new goal chain with primary goal and reproductive clause
- `add_sub_goals` - Add sub-goals to decompose the primary objective
- `update_sub_goal_status` - Update sub-goal status with learnings
- `mutate_reproductive_clause` - Evolve the primary goal and principles based on learnings
- `infer_sub_goals` - Infer new sub-goals from record space patterns

#### Key Concepts

**Reproductive Clause**: The lifeline of a goal chain containing:
- Primary goal that evolves conservatively
- Essential principles that guide evolution
- Mutation guidelines for conservative change
- Invariant constraints that must never be violated

**Record Space**: Accumulated history of the chain including:
- Goal creation and completion events
- Learnings from each sub-goal
- Mutation history and reasoning
- Success/failure patterns

**Evolutionary Process**:
- Sub-goals serve the primary goal
- Learnings are collected from completed sub-goals
- When sufficient learnings accumulate, the reproductive clause mutates
- Mutations are conservative and incremental
- The primary goal evolves across generations

**Sub-Goal Inference**:
- Record space contains the evolutionary history
- Blocked goals trigger inference of alternative approaches
- Complex primary goals suggest intermediate steps
- Inferred goals remain aligned with reproductive clause

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

### Single Goal Example

```
You: /goal Implement a REST API for user management

Assistant: Goal set successfully.

You: Create a User model with fields: id, name, email, created_at

Assistant: [Creates User model]

You: [Session becomes idle...]

Assistant: [Automatically continues] I'll continue working on the REST API for user management...
[Proceeds to implement controllers, routes, etc.]
```

### Goal Chain Example

```
You: /goalchain create Build a comprehensive e-commerce platform with payment processing, inventory management, and user authentication

Assistant: Goal chain created:
GOAL CHAIN: chain-1
Status: ACTIVE
Generation: 1 / 1

PRIMARY GOAL:
Build a comprehensive e-commerce platform with payment processing, inventory management, and user authentication

REPRODUCTIVE CLAUSE (v1):
  Essential Principles:
    - Preserve the core purpose and intent
    - Maintain alignment with original objectives
    - Respect established constraints
  Mutation Guidelines:
    - Mutate conservatively and incrementally
    - Preserve proven successful approaches
    - Allow adaptation based on learnings

SUB-GOALS (0):

You: Break this down into initial sub-goals

Assistant: [Calls add_sub_goals]
Added 4 sub-goals to chain chain-1:
  - [PENDING] Design database schema for e-commerce platform
  - [PENDING] Implement user authentication system
  - [PENDING] Build product catalog and inventory management
  - [PENDING] Implement payment processing system

You: Start with the database schema

Assistant: [Calls update_sub_goal_status to activate first sub-goal]
Sub-goal subgoal-1 updated to ACTIVE

[... works on database schema ...]

You: Mark the database schema as complete with what we learned

Assistant: [Calls update_sub_goal_status with learnings]
Sub-goal subgoal-1 updated to COMPLETE

Learnings recorded:
  - PostgreSQL provides better JSON support than expected
  - Schema should accommodate future multi-tenant support
  - Indexing strategy needs early consideration

[... continues with more sub-goals ...]

You: The learnings suggest we should update our approach

Assistant: [Calls mutate_reproductive_clause]
Reproductive clause mutated to version 2

Reason: Evolution based on 3 learnings from 2 completed goals
Confidence: 80%

Primary goal: Build a multi-tenant e-commerce platform with payment processing, inventory management, and user authentication

New principles:
  - Preserve the core purpose and intent
  - Maintain alignment with original objectives
  - Respect established constraints
  - PostgreSQL JSON support simplifies schema evolution
  - Multi-tenant architecture must be designed from start
  - Early indexing strategy prevents performance issues

[... chain evolves over generations ...]
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

### Single Goal Statuses

- **active** - Goal is in progress, automatic continuation is enabled
- **paused** - Goal is suspended by user, no automatic continuation
- **blocked** - Goal cannot proceed (marked by LLM)
- **complete** - Goal has been achieved (marked by LLM)
- **budget_limited** - Token budget has been exhausted

### Goal Chain Statuses

- **active** - Chain is currently running, sub-goals can be executed
- **paused** - Chain is suspended, no sub-goal work
- **evolving** - Chain is undergoing reproductive clause mutation
- **complete** - All sub-goals completed and primary goal achieved

### Sub-Goal Statuses

- **pending** - Sub-goal created but not yet started
- **active** - Sub-goal currently being worked on
- **complete** - Sub-goal finished successfully, learnings recorded
- **blocked** - Sub-goal cannot proceed, may trigger inference

## Single Goals vs Goal Chains

### When to Use Single Goals
- Simple, straightforward tasks
- One-time objectives
- Quick wins and iterations
- Prototyping and exploration
- Tasks with clear, linear progression

### When to Use Goal Chains
- Complex, multi-stage objectives
- Long-term projects requiring decomposition
- Situations where learnings should inform future direction
- Tasks that may evolve significantly over time
- Projects requiring adaptive planning
- Multi-generational work where the approach will improve

### Key Differences

| Feature | Single Goals | Goal Chains |
|---------|--------------|-------------|
| Scope | Single objective | Hierarchical objectives |
| Evolution | Static | Evolves across generations |
| Learning | Limited | Systematic accumulation |
| Adaptation | Manual | Automatic inference |
| Persistence | Session-based | Multi-generational |
| Complexity | Simple | Complex, evolutionary |
| Best For | Quick tasks | Complex projects |

## Architecture

Telos is structured as a TypeScript Pi extension with four main modules:

- **GoalManager** (`goal-manager.ts`) - Manages goal state and persistence
- **GoalTools** (`goal-tools.ts`) - Implements LLM-facing goal tools
- **GoalContinuation** (`goal-continuation.ts`) - Handles automatic continuation logic
- **GoalChainManager** (`goal-chain.ts`) - Manages evolutionary goal chains

### Event Flow (Single Goals)

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

### Event Flow (Goal Chains)

```
/goalchain create → GoalChainManager
                      ↓
         Create reproductive clause (lifeline)
                      ↓
         Add initial sub-goals
                      ↓
         Execute sub-goals → Record learnings
                      ↓
         Accumulate learnings in record space
                      ↓
         When threshold reached → Evolve chain
                      ↓
         Mutate reproductive clause conservatively
                      ↓
         Infer new sub-goals from patterns
                      ↓
         Next generation begins
                      ↓
         Repeat until primary goal achieved
```

## Research & Design

Telos is based on research of the Codex `/goal` feature from the openai/codex repository (commit d2484697). Key design decisions:

- **Thread-scoped persistence**: Goals are stored per session/thread, similar to Codex's `thread_goals` table
- **Status model**: Mirrors Codex's status enum with Pi-appropriate adjustments
- **Model tools**: LLM can get/create/update goals, but pause/resume remain user-controlled
- **Continuation steering**: Injects context to guide the LLM without full prompt rewriting
- **Budget limits**: Token budgets help control costs for long-running autonomous work

### Advanced: Evolutionary Goal Chains

Goal chains introduce several advanced concepts inspired by evolutionary AI and recursive self-improvement:

**Non-Deterministic Model Generations**:
- Goal rewrites and sub-goal inferences are LLM-generated
- Each generation explores slightly different approaches
- Diversity in sub-goal decomposition prevents local optima
- Mutations are guided but not strictly determined

**Deterministic Caching of Reproductive Clause**:
- The reproductive clause is cached deterministically
- Serves as a lifeline for chain recovery
- Enables inference of sub-goals even if some state is lost
- Cache persists for 1 hour with version tracking

**Conservative Evolution**:
- Primary goal mutates slowly across generations
- Each mutation preserves proven successful elements
- Learnings are accumulated and validated before mutation
- Invariant constraints protect against destructive changes

**Record Space as Memory**:
- Accumulates all goal events and learnings
- Enables pattern recognition and inference
- Sub-goals can be inferred from blocked goals
- History guides future generations

**Lifeline Concept**:
- The reproductive clause contains the essential "DNA" of the chain
- Even if individual sub-goals are lost, the primary purpose survives
- Enables reconstruction of approximate state from record space
- Primary goal and principles are never lost if cached

See `docs/research/codex_goal_feature_research.md` for detailed research notes on Codex's implementation.

## Limitations & Differences from Codex

- No app-server protocol (Pi uses different architecture)
- Goals are session-scoped rather than thread-scoped (Pi's session ≈ Codex's thread)
- No desktop/app UI integration (TUI only)
- Simplified continuation logic (no complex rollout/rollback)
- Goals stored in session entries rather than SQLite
- Goal chains are a Telos-specific feature not present in Codex
- Evolutionary mutations are simplified compared to full recursive self-improvement

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