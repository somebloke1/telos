# Telos Extension Design Document

## Overview

Telos is a Pi Coding Assistant extension that implements `/goal` functionality inspired by Codex's persistent thread goal feature. This document describes the architecture, design decisions, and implementation details.

## Goals

1. Provide persistent goal tracking across Pi sessions
2. Enable automatic continuation when goals are active
3. Give the LLM goal-aware tools and context
4. Track token usage and enforce budget limits
5. Maintain compatibility with Pi's extension architecture

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Main Extension                         │
│                        (src/index.ts)                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ GoalManager  │  │  GoalTools   │  │ GoalContinuation │  │
│  │              │  │              │  │                  │  │
│  │ - State      │  │ - get_goal   │  │ - Auto-continue  │  │
│  │ - Validation │  │ - create_goal│  │ - Steering msgs  │  │
│  │ - Persistence│  │ - update_goal│  │ - Budget checks  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Pi Extension API│
                    │                 │
                    │ - Events        │
                    │ - Commands      │
                    │ - Tools         │
                    │ - Session Mgr   │
                    └─────────────────┘
```

### Data Flow

#### Setting a Goal

```
User: /goal <objective>
  ↓
Command handler validates and creates goal
  ↓
GoalManager stores goal in memory
  ↓
GoalManager persists goal as custom session entry
  ↓
GoalContinuation enables automatic continuation
```

#### LLM Tool Call

```
LLM: get_goal()
  ↓
GoalTools retrieves goal from GoalManager
  ↓
GoalTools formats goal information
  ↓
Result returned to LLM with details
```

#### Automatic Continuation

```
Turn completes
  ↓
GoalContinuation checks:
  - Is continuation enabled?
  - Is agent idle?
  - Is goal active?
  - Is budget exhausted?
  ↓
If all checks pass → Trigger continuation turn
  ↓
Inject continuation steering message (delivered as followUp)
  ↓
Pi's agent loop drains the follow-up queue before agent_end
  ↓
New turn starts with goal context
```

> **Note:** Continuations are delivered with `{ deliverAs: "followUp" }`
> because `isStreaming` is still `true` during `turn_end` handling — a bare
> `sendUserMessage` would throw and be swallowed, halting continuation.
> See [continuation-halt-postmortem.md](continuation-halt-postmortem.md).

## Design Decisions

### 1. Session vs. Thread Scoping

**Decision:** Goals are session-scoped (not thread-scoped like Codex)

**Rationale:**
- Pi uses "sessions" rather than "threads"
- A Pi session ≈ a Codex thread
- Simplifies implementation without losing functionality
- Goals persist via session entries automatically

### 2. Status Model

**Decision:** Five statuses: `active`, `paused`, `blocked`, `complete`, `budget_limited`

**Rationale:**
- Matches Codex's status enum with minor adjustments
- Clear semantic meaning for each state
- Enables proper continuation control
- Supports both user and LLM status changes

### 3. User vs. LLM Control

**Decision:** Users control pause/resume/clear; LLM controls complete/blocked

**Rationale:**
- Keeps humans in the loop for session control
- Prevents LLM from accidentally stopping work
- Allows LLM to signal completion or blockers
- Matches Codex's permission model

### 4. Persistence Strategy

**Decision:** Store goals as custom session entries

**Rationale:**
- Leverages Pi's built-in session persistence
- No need for additional storage (SQLite, files)
- Goals automatically survive session reload
- Compatible with Pi's session branching

**Trade-offs:**
- Slightly more complex state reconstruction
- Must scan session entries on load
- Benefits outweigh complexity

### 5. Continuation Strategy

**Decision:** Inject steering messages rather than modify system prompt

**Rationale:**
- Less invasive to Pi's prompt engineering
- Easier to implement and maintain
- Steering messages can be context-specific
- Similar to Codex's approach

**Continuation Trigger:**
- After each turn ends (`turn_end` event)
- Only when agent is idle
- Only when goal is active
- Minimum 2-second interval between continuations
- Delivered as `followUp` (not a bare `sendUserMessage`) so the message is
  queued during the `turn_end` streaming window and drained by Pi's agent
  loop before `agent_end`

### 6. Token Budget Implementation

**Decision:** Optional budget per goal, tracked across all turns

**Rationale:**
- Helps control costs for autonomous work
- User-specified limits prevent runaway token usage
- Budget exhaustion triggers `budget_limited` status
- Matches Codex's budget model

**Tracking:**
- Count tokens from each assistant message
- Exclude cached input tokens (as Codex does)
- Update on `message_end` event
- Check budget after each tool completion

### 7. Tool Constraints

**Decision:** LLM can only create goals when no unfinished goal exists

**Rationale:**
- Prevents accidental goal replacement
- Forces explicit user intent for new goals
- Matches Codex's tool semantics
- Encourages goal completion

**Allowed LLM operations:**
- `get_goal` - Always allowed
- `create_goal` - Only when no unfinished goal exists
- `update_goal` - Only to `complete` or `blocked`

## Event Integration

### Events We Listen To

| Event | Purpose |
|-------|---------|
| `session_start` | Load goal state from session |
| `session_shutdown` | Cleanup (minimal needed) |
| `turn_end` | Check if continuation needed |
| `message_end` | Track token usage |
| `tool_execution_end` | Handle goal updates |

### Events We Emit

None directly - we use `pi.sendMessage()` and `pi.appendEntry()` instead

## Error Handling

### Validation Errors

- Empty objective → Error message to user
- Objective too long (>4000 chars) → Error message
- Invalid status transition → Error message
- Invalid token budget (≤0) → Error message

### State Errors

- Creating goal when one exists → Error message
- Updating non-existent goal → Error message
- Operations on terminal status → Handled gracefully

### Runtime Errors

- Continuation failure → Log error, disable continuation
- Session load failure → Start fresh (no goal)
- Budget check failure → Continue without budget enforcement

## Testing Strategy

### Unit Tests (Future)

- GoalManager state transitions
- GoalTools parameter validation
- GoalContinuation trigger logic
- Token budget calculations

### Integration Tests (Manual)

- Full goal lifecycle: create → work → complete
- Pause/resume functionality
- Budget limit behavior
- Session persistence
- Automatic continuation

### Edge Cases

- Empty objectives
- Very long objectives
- Zero/negative budgets
- Rapid continuation requests
- Session reload with goal

## Future Enhancements

### Priority 1

1. **Goal visualization in TUI**
   - Show goal status in footer
   - Widget displaying current goal
   - Progress bar for token budget

2. **Goal templates**
   - Predefined goal templates
   - Quick goal creation
   - Template management

3. **File-based objectives**
   - Read objectives from GOAL.md
   - Support >4000 char objectives
   - Edit goal files with `/goal edit`

### Priority 2

4. **Enhanced continuation strategies**
   - Context-aware continuation prompts
   - Variable continuation frequency
   - Smart continuation triggering

5. **Goal analytics**
   - Time tracking per goal
   - Token usage statistics
   - Goal completion rates

6. **Multi-goal support**
   - Multiple active goals
   - Goal prioritization
   - Goal dependencies

### Priority 3

7. **Integration features**
   - GitHub issue → goal conversion
   - Project file scanning for goals
   - Goal sharing between sessions

8. **Advanced budgeting**
   - Time budgets
   - Turn count limits
   - Per-tool budgets

## Performance Considerations

### Token Overhead

- Steering messages: ~200-300 tokens per continuation
- Goal state in tools: ~100-200 tokens per get_goal
- Net impact: Minimal relative to typical session size

### Session Size

- Goal entries: ~500 bytes per goal state
- Accumulation: One entry per significant state change
- Mitigation: Only persist on state transitions

### Continuation Frequency

- Minimum interval: 2 seconds
- Prevents runaway loops
- User can pause anytime

## Security Considerations

### No Security Risks Identified

- No external API calls
- No file system access beyond Pi's normal operations
- No code execution beyond Pi's normal operations
- Goals are user-specified text only

## Compatibility

### Pi Version Compatibility

- Designed for Pi 1.0+
- Uses stable extension APIs
- No experimental features

### Future Pi Changes

- Session format changes → May require migration
- Extension API changes → May require updates
- Event model changes → May require reimplementation

## API Reference

### Single Goal Commands (User)

| Command | Description |
|---------|-------------|
| `/goal <objective>` | Create a new goal |
| `/goal` | View current goal |
| `/goal pause` | Pause goal (stops continuation) |
| `/goal resume` | Resume paused goal |
| `/goal clear` | Remove current goal |

### Single Goal Tools (LLM)

| Tool | Purpose |
|------|---------|
| `get_goal` | Retrieve goal, status, and token stats |
| `create_goal` | Create goal (only when no unfinished goal exists) |
| `update_goal` | Update goal to `complete` or `blocked` |

### Goal Chain Commands (User)

| Command | Description |
|---------|-------------|
| `/goalchain create <primary_goal>` | Create evolutionary chain |
| `/goalchain continue [id]` | Trigger agent continuation |
| `/goalchain handoff [id]` | Move chain to fresh session |
| `/goalchain list` | List all chains |
| `/goalchain show <id>` | Show chain details |
| `/goalchain add_sub_goal <id> <objective>` | Add sub-goal |
| `/goalchain infer <id>` | Infer sub-goals from record space |
| `/goalchain diagnose` | Show persistence diagnostics |
| `/goalchain delete <id>` | Delete chain |

### Goal Chain Tools (LLM)

| Tool | Purpose |
|------|---------|
| `get_goal_chain` | Retrieve chain, clause, sub-goals, record space |
| `create_goal_chain` | Create chain with primary goal, principles, sub-goals |
| `add_sub_goals` | Add sub-goals to existing chain |
| `update_sub_goal_status` | Update sub-goal status with optional learnings |
| `mutate_reproductive_clause` | Evolve clause based on accumulated learnings |
| `infer_sub_goals` | Infer sub-goals from record space patterns |

### Sub-Goal Status Transitions

```
pending → active → complete
                → blocked
```

### Goal Status Transitions

```
active → paused → active
       → complete (terminal)
       → blocked  → active
       → budget_limited → active / complete
```

## Recent Evolution

### v0.1.1 (Footer Restoration)

The TUI footer (`renderGoalFooter`) was updated to cover all goal state change paths:
- Restored on `session_start` after session reload
- Updated on `/goal clear`, `/goal pause`, `/goal resume`
- Updated on `message_end` after token accounting
- Already updated on `create_goal` and `update_goal` tool execution

### v0.1.2 (Test Suite)

- Installed `tsx` for TypeScript test execution
- Created 16 unit tests for `GoalChainManager`
- Created 8 integration tests covering full lifecycle, budgets, transitions, persistence
- All 33 tests pass (16 new + 9 existing static analysis)
- Fixed `mutateReproductiveClause` edge case with empty array fallback
- Updated `package.json` test script to use tsx

### v0.1.3 (Bug Fixes)

- Fixed `addToRecordSpace` in `updateSubGoalStatus` to use `resolvedId` instead of raw `subGoalId`
- Removed dead code `injectBudgetLimitSteering` and `injectObjectiveUpdatedSteering` from `goal-continuation.ts`
- Removed stale comment "Audit completion requirement-by-requirement"
- Added guard for `MIN_CONTINUATION_INTERVAL <= 0` to prevent thundering herd

### v0.1.4 (Documentation)

- Created `docs/goal-philosophy.md` — the Aristotelian reasoning behind intention→reality pipeline
- Comprehensive API reference added to `docs/design.md`
- Goal chain technical summary in `docs/goal-chain-technical-summary.md`

## References

- [Codex Goal Feature Research](./research/codex_goal_feature_research.md)
- [Goal Chain Technical Summary](./goal-chain-technical-summary.md)
- [Goal Philosophy](./goal-philosophy.md)
- [Pi Extensions Documentation](https://github.com/earendil-works/pi-mono/tree/main/packages/coding-agent/docs)
- [OpenAI Codex Repository](https://github.com/openai/codex)