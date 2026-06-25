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
- `/goal edit` - Open an editor to modify the current goal (large objectives stored transparently)
- `/goal template list` - List predefined objective templates
- `/goal template use <id> [focus]` - Create a goal from a predefined template with optional focus details

#### LLM Tools

- `get_goal` - Retrieve the current goal, its status, and usage statistics
- `create_goal` - Create a new goal (only when no unfinished goal exists)
- `update_goal` - Update goal status to "complete" or "blocked"

### Goal Chains (Evolutionary Goal Management)

#### User Commands

- `/goalchain create <primary_goal>` - Create a new evolutionary goal chain
- `/goalchain continue [id]` - Resume/trigger agent continuation for a chain
- `/goalchain handoff [id]` - Start a fresh session with a compact chain continuity brief
- `/goalchain list` - List all goal chains
- `/goalchain show <id>` - View compact information about a goal chain
- `/goalchain detail <id> <sub_goal_id>` - View full cold-memory detail for a sub-goal
- `/goalchain compact <id>` - Distill goal-chain history into warm-memory summaries
- `/goalchain add_sub_goal <id> <objective>` - Add a sub-goal to an existing chain
- `/goalchain mutate <id>` - Prompt mutation guidance for the reproductive clause
- `/goalchain infer <id>` - Infer sub-goals from record space
- `/goalchain diagnose` - Show persistence diagnostics for troubleshooting
- `/goalchain delete <id>` - Delete a goal chain

#### LLM Tools

- `get_goal_chain` - Retrieve goal chain information including reproductive clause and sub-goals
- `create_goal_chain` - Create a new goal chain with primary goal and reproductive clause
- `add_sub_goals` - Add sub-goals to decompose the primary objective
- `update_sub_goal_status` - Update sub-goal status with learnings
- `mutate_reproductive_clause` - Evolve the primary goal and principles based on learnings
- `infer_sub_goals` - Infer new sub-goals from record space patterns

Goal chains are now persisted in session data, so `/goalchain list`, `show`, and evolving reproductive clauses survive prompts and session reloads. Reproductive clauses are restored deterministically and still mutate conservatively as learning accumulates.

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

### Adaptive GitHub Maintenance Automation

This repository now includes an adaptive, continuous GitHub maintenance workflow:

- `.github/workflows/github-maintenance.yml` runs every hour.
- The maintenance interval is computed dynamically from recent activity.
- If there are no changes for a sustained period, maintenance backs off to approximately twice per week.
- During active periods, it ramps up toward hourly maintenance.
- Interval transitions are smoothed using short/long activity windows to avoid abrupt changes.

Maintenance checks currently include repository activity checks and a health report written to:

- `.github/maintenance/latest-report.json`

See [`docs/github-maintenance.md`](docs/github-maintenance.md) for details and tuning guidance. For issue and PR workflows, see [`docs/github-development.md`](docs/github-development.md).

## Installation

### Quick Start

For immediate testing:

```bash
cd /path/to/telos
pi -e ./src/index.ts
```

### Installation Options

**Global Installation**:
```bash
cp -r telos/src ~/.pi/agent/extensions/telos
pi
```

**Project-Local Installation**:
```bash
mkdir -p .pi/extensions
cp -r telos/src .pi/extensions/telos
pi
```

**GitHub Clone**:
```bash
git clone https://github.com/somebloke1/telos.git ~/.pi/agent/extensions/telos
pi
```

### Important Notes
- Commands work when typed directly (see [SLASH_COMMANDS.md](SLASH_COMMANDS.md))
- `/goal` and `/goalchain` may not appear in slash command menu (Pi 0.78.0 limitation)
- All commands are fully functional when typed
- See [INSTALLATION.md](INSTALLATION.md) for detailed instructions

## TUI Integration

Telos integrates with Pi's TUI to provide real-time goal and goal chain status visualization in the footer.

### Goal Status Footer

The goal footer displays the current goal status using compact colorized codes:

| Status | Code | Color | Description |
|--------|------|-------|-------------|
| active | [A] | Green | Goal is active, continuation enabled |
| paused | [P] | Yellow | Goal is paused, no continuation |
| blocked | [B] | Red | Goal is blocked |
| complete | ✓ | Cyan | Goal completed |
| budget_limited | ⌀ | Gray | Budget exhausted |

### Goal Chain Widget

When a goal chain is active, a rich chain widget appears in the footer showing:

```
╔══════════════════════════════════════════════╗
║ Chain: Continue methodical incremental ...   ║
║ Sub-goals: 10/20 done · 5 active             ║
║ ⊕3 g12 ℒ47  [A]                              ║
║ → Design system architecture                  ║
║ → Implement core modules                      ║
║ Recent: "TypeScript compilation works well"   ║
╚══════════════════════════════════════════════╝
```

**Evolution Symbols:**

| Symbol | Meaning | Example |
|--------|---------|----------|
| ⊕N | Clause version | ⊕3 = reproductive clause v3 |
| gN | Generation | g12 = generation 12 |
| ℒN | Learnings count | ℒ47 = 47 accumulated learnings |

**Sub-Goal Progress:**

```
Sub-goal breakdown:
  ✓ 10 done · 5 active · 3 blocked · 2 pending
```

Each sub-goal displays its status code alongside progress information.

**Actionable Sub-Goals:**

When sub-goals are not yet complete, the widget shows the next actionable sub-goals (up to 2):
```
→ Design system architecture
→ Implement core modules
```

**Learnings Preview:**

Recent learnings from completed sub-goals are shown as a preview (truncated at 80 chars):
```
Recent: "TypeScript compilation works well" "Multi-tenant design needed"
```

### Colorized Status Integration

The TUI uses ANSI color codes for status display:

- **Green** for active states
- **Yellow** for paused/warnings
- **Red** for blocked/error states
- **Cyan** for completed states
- **Bright** for unknown statuses (fallback)
- **Gray** for budget-limited

Colors are applied consistently across goal status, chain status, and sub-goal status displays.

## Configuration

Telos uses a centralized app-level configuration module (`src/config.ts`) so static values can migrate to configurable settings over time without scattering environment lookups through feature code.

### Goal Chain Curator Configuration

The goal-chain cognitive metabolism layer has two separately configurable roles:

- **Curator**: future embedding-backed semantic selection over record space. Current compaction remains local and deterministic when curator is disabled.
- **Distiller**: async model-backed reproductive-clause principle extraction. If no equivalent distiller is configured or a distiller fails, Telos skips automatic mutation and records the skip; it does not substitute keyword or deterministic principle extraction.

| Variable | Default | Description |
|----------|---------|-------------|
| `TELOS_CURATOR_ENABLED` | `false` | Enable semantic curator metadata path |
| `TELOS_CURATOR_PROVIDER` | `none` | Curator provider (`none` or `ollama`) |
| `TELOS_CURATOR_HOST` | `http://127.0.0.1:11434` | Ollama host for local embedding calls |
| `TELOS_CURATOR_MODEL` | `snowflake-arctic-embed2:latest` | Embedding model name |
| `TELOS_CURATOR_TOP_K` | `8` | Number of semantically relevant records/clusters to retain |
| `TELOS_CURATOR_TIMEOUT_MS` | `5000` | Curator request timeout budget |
| `TELOS_CURATOR_ANCHOR_FILES` | `ROADMAP.md,README.md` | Stable semantic anchors for future embedding-backed curation |
| `TELOS_DISTILLER_ENABLED` | `false` | Enable async model-backed reproductive-clause distillation |
| `TELOS_DISTILLER_PROVIDER` | `none` | Distiller provider (`none` or `openai-compatible`; `litellm` accepted as alias) |
| `TELOS_DISTILLER_MODEL` | `litellm/codex/gpt-5.4` | Reasoning model for principle extraction |
| `TELOS_DISTILLER_BASE_URL` | unset | OpenAI-compatible chat-completions base URL, e.g. LiteLLM gateway |
| `TELOS_DISTILLER_API_KEY_ENV` | `OPENAI_API_KEY` | Environment variable containing the distiller API key |
| `TELOS_DISTILLER_TIMEOUT_MS` | `30000` | Distiller request timeout budget |
| `TELOS_DISTILLER_MAX_PRINCIPLES` | `8` | Maximum reproductive-clause principles retained |

Recommended local embedding model:

```bash
TELOS_CURATOR_ENABLED=true \
TELOS_CURATOR_PROVIDER=ollama \
TELOS_CURATOR_HOST=http://127.0.0.1:11434 \
TELOS_CURATOR_MODEL=snowflake-arctic-embed2:latest \
pi --no-extensions -e ./src/index.ts
```

Recommended distiller model through an OpenAI-compatible/LiteLLM target:

```bash
TELOS_DISTILLER_ENABLED=true \
TELOS_DISTILLER_PROVIDER=openai-compatible \
TELOS_DISTILLER_MODEL=litellm/codex/gpt-5.4 \
TELOS_DISTILLER_BASE_URL=http://127.0.0.1:4000 \
TELOS_DISTILLER_API_KEY_ENV=OPENAI_API_KEY \
pi --no-extensions -e ./src/index.ts
```

`local-embedder:latest` is also suitable when it aliases Snowflake locally. `nomic-embed-text:v1.5` is a lightweight alternative embedding model. `qwen3-embedding:8b` may provide higher semantic discrimination at higher runtime cost.

The current implementation records curator configuration in compaction summaries. Distillation is used only when explicitly configured; otherwise automatic reproductive-clause mutation is skipped rather than approximated. The intended embedder/curator cooperation model is specified in `docs/goal-chain-curator-distiller-spec.md`.

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
- Evolutionary mutations require a configured async distiller for automatic principle extraction; without one, mutation is skipped rather than approximated

## Contributing

Contributions welcome! Areas for improvement:

- Enhanced goal visualization in TUI
- Goal templates and presets
- Integration with project files (e.g., read objectives from GOAL.md)
- More sophisticated continuation strategies
- Goal analytics and reporting

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Documentation

- **[INSTALLATION.md](INSTALLATION.md)** - Detailed installation instructions
- **[SLASH_COMMANDS.md](SLASH_COMMANDS.md)** - Why commands may not appear in slash menu
- **[TESTING.md](TESTING.md)** - Comprehensive testing procedures
- **[EXAMPLES.md](EXAMPLES.md)** - Real-world usage examples
- **[docs/design.md](docs/design.md)** - Architecture and design decisions
- **[docs/goal-chain-technical-summary.md](docs/goal-chain-technical-summary.md)** - Goal chain technical details
- **[docs/goal-chain-curator-distiller-spec.md](docs/goal-chain-curator-distiller-spec.md)** - Intended embedder/curator and distiller cooperation model
- **[ROADMAP.md](ROADMAP.md)** - Development roadmap
- **[CHANGELOG.md](CHANGELOG.md)** - Version history

## Quick Reference

### Single Goals
```
/goal <objective>      Set a goal
/goal                  View current goal
/goal pause            Pause goal
/goal resume           Resume goal  
/goal clear            Clear goal
/goal edit             Edit current goal in editor
/goal template list    List objective templates
/goal template use <id> [focus]  Create goal from a template
```

### Goal Chains
```
/goalchain create <primary_goal>    Create evolutionary chain
/goalchain continue [id]            Trigger chain continuation
/goalchain handoff [id]             Move active chain to a fresh session
/goalchain list                     List all chains
/goalchain show <id>                Show compact chain details
/goalchain detail <id> <sub_goal_id>      Show full sub-goal detail
/goalchain compact <id>             Distill chain history
/goalchain add_sub_goal <id> <objective>  Add a sub-goal
/goalchain mutate <id>              Show mutation guidance
/goalchain infer <id>               Infer sub-goals
/goalchain diagnose                 Show persistence diagnostics
/goalchain delete <id>              Delete chain
```

**Note**: Type commands directly - they work even if not in slash menu.

## Troubleshooting

### Commands Not Working

If commands don't work:
1. Verify extension is loaded: `pi -e /path/to/telos/src/index.ts`
2. Type commands directly (no autocomplete in Pi 0.78.0)
3. Check for error messages in console
4. See [SLASH_COMMANDS.md](SLASH_COMMANDS.md) for details

### Extension Not Loading

1. Check file structure matches expected format
2. Verify TypeScript syntax (some type errors expected)
3. Restart Pi after installation
4. See [INSTALLATION.md](INSTALLATION.md) for troubleshooting

### Goals Not Persisting

1. Ensure session is being saved (not ephemeral)
2. Check session file permissions
3. Verify goal entries are being written

### Automatic Continuation Not Working

1. Ensure goal status is 'active'
2. Check agent is truly idle
3. Verify continuation is enabled
4. Wait minimum 2 seconds between turns

## License

MIT License - see [LICENSE.md](LICENSE.md)

## Acknowledgments

- Inspired by OpenAI Codex's `/goal` feature
- Built with [Pi Coding Agent](https://github.com/earendil-works/pi-mono)
- Research based on [openai/codex](https://github.com/openai/codex) repository

## Author

[@somebloke1](https://github.com/somebloke1)