# Codex `/goal` feature: verified implementation research

Research date: 2026-06-23  
Repository examined: `openai/codex` at commit `d2484697b1f9ce33d1d818ccad859ca3a4d721c6`.

> Scope note: this document is based on the public `openai/codex` source tree, official OpenAI documentation, release notes, and public GitHub/community reports. I do not have a Context7 connector exposed in this Pi session; the equivalent source/documentation checks were performed directly against the repository and public docs.

## Executive summary

Codex Goals are a stable, default-enabled feature that attaches one persistent, thread-scoped objective to a saved/materialized thread. The implementation is not “just a prompt”: it is a coordinated system spanning SQLite persistence, app-server JSON-RPC methods, model-visible goal tools, runtime lifecycle hooks, continuation steering prompts, and TUI/client UX.

At a high level:

1. The TUI slash command `/goal ...` calls app-server goal APIs, not a normal model prompt.
2. The app-server persists one goal per thread in `thread_goals` and emits `thread/goal/updated` or `thread/goal/cleared` notifications.
3. The model receives goal tools (`get_goal`, `create_goal`, `update_goal`) only when Goals are enabled and available for that thread.
4. The runtime tracks active goal time/tokens across turns and automatically starts continuation turns while the goal is active.
5. The model can mark goals `complete` or `blocked`; user/system code controls pause/resume, budget/usage limits, and clear.
6. Goals require a persisted thread. Ephemeral sessions are explicitly rejected.

## User-facing behavior from official documentation

Official OpenAI docs describe `/goal` as a persistent objective for longer tasks. CLI slash-command docs say users can:

```text
/goal <objective>   set the goal
/goal               view the current goal
/goal pause         pause it
/goal resume        resume it
/goal clear         remove it
```

The same docs state that goal objectives must be non-empty and at most 4,000 characters; longer instructions should go in a file and be referenced from the goal. Sources: [CLI slash commands](https://developers.openai.com/codex/cli/slash-commands), [app commands](https://developers.openai.com/codex/app/commands), [follow goals guide](https://developers.openai.com/codex/use-cases/follow-goals), and [Using Goals cookbook](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex).

Release notes for `rust-v0.128.0` introduced “persisted `/goal` workflows with app-server APIs, model tools, runtime continuation, and TUI controls for create, pause, resume, and clear.” Public changelog/search results also show the feature later became stable/default-on and available across app, IDE extension, and CLI.

## Feature flag and availability

The feature is represented by `Feature::Goals` with the comment “Enable persisted thread goals and automatic goal continuation” in [`codex-rs/features/src/lib.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/features/src/lib.rs#L214-L215). In the current source it is registered as key `goals`, stage `Stable`, and `default_enabled: true` in [`features/src/lib.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/features/src/lib.rs#L1225-L1229).

The TUI hides or disables the command when the feature is not enabled: the slash-command list filters out `SlashCommand::Goal` unless `goal_command_enabled` is true ([`bottom_pane/slash_commands.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/bottom_pane/slash_commands.rs#L63-L79)), and `ChatWidget` syncs that flag from `Feature::Goals` ([`chatwidget/settings.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/chatwidget/settings.rs#L296-L298)).

## Data model and validation

### Protocol shape

The protocol-level goal status enum is:

- `Active`
- `Paused`
- `Blocked`
- `UsageLimited`
- `BudgetLimited`
- `Complete`

This is defined in [`codex-rs/protocol/src/protocol.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/protocol/src/protocol.rs#L3840-L3847). The same file defines `MAX_THREAD_GOAL_OBJECTIVE_CHARS = 4_000` and validates objectives as non-empty and within that character limit ([`protocol.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/protocol/src/protocol.rs#L3849-L3860)). The protocol `ThreadGoal` includes `thread_id`, `objective`, `status`, optional `token_budget`, `tokens_used`, `time_used_seconds`, `created_at`, and `updated_at` ([`protocol.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/protocol/src/protocol.rs#L3865-L3878)).

The app-server v2 schema mirrors this shape and exposes `ThreadGoalSetParams` with `threadId`, optional `objective`, optional `status`, and optional nullable `tokenBudget` ([`app-server-protocol/src/protocol/v2/thread.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L719-L782)).

### SQLite storage

Goals are stored in a `thread_goals` table keyed by `thread_id`, meaning there is at most one goal per thread. The initial migration stores `goal_id`, `objective`, `status`, optional `token_budget`, `tokens_used`, `time_used_seconds`, and timestamps ([`state/migrations/0029_thread_goals.sql`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/state/migrations/0029_thread_goals.sql#L1-L11)). A later migration expands legal statuses to include `blocked` and `usage_limited` ([`0033_thread_goal_stopped_statuses.sql`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/state/migrations/0033_thread_goal_stopped_statuses.sql#L3-L18)).

The state model maps snake_case database statuses to `ThreadGoalStatus`, and treats `BudgetLimited` and `Complete` as terminal in `is_terminal()` ([`state/src/model/thread_goal.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/state/src/model/thread_goal.rs#L14-L41)).

### Store semantics

`GoalStore` provides the persistence semantics:

- `get_thread_goal` reads the single row for a thread ([`state/src/runtime/goals.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/state/src/runtime/goals.rs#L41-L66)).
- `replace_thread_goal` inserts or replaces the row, generates a new `goal_id`, resets usage counters, and applies immediate budget-limited status if needed ([`goals.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/state/src/runtime/goals.rs#L68-L123)).
- `insert_thread_goal` inserts a new goal but only replaces an existing one if the existing status is `complete` ([`goals.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/state/src/runtime/goals.rs#L125-L181)). This is why model `create_goal` fails for unfinished goals.
- `update_thread_goal` can update objective/status/budget with optimistic protection via `expected_goal_id`; when setting `active`, it preserves `budget_limited` if the budget is already exhausted ([`goals.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/state/src/runtime/goals.rs#L183-L329)).
- `account_thread_goal_usage` increments elapsed time and tokens, and transitions to `budget_limited` when `tokens_used + token_delta >= token_budget` ([`goals.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/state/src/runtime/goals.rs#L411-L523)).

## App-server API

The app-server exposes:

- `thread/goal/set`
- `thread/goal/get`
- `thread/goal/clear`
- notifications `thread/goal/updated` and `thread/goal/cleared`

The official app-server README lists these API methods and notifications ([`app-server/README.md`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/app-server/README.md#L150-L155)).

The implementation is in `ThreadGoalRequestProcessor`:

- All three API methods reject requests when `Feature::Goals` is disabled ([`thread_goal_processor.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/app-server/src/request_processors/thread_goal_processor.rs#L97-L105), [`#L166-L171`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/app-server/src/request_processors/thread_goal_processor.rs#L166-L171), [`#L186-L191`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/app-server/src/request_processors/thread_goal_processor.rs#L186-L191)).
- `thread_goal_set` parses the thread id, rejects unsupported/ephemeral state via `state_db_for_materialized_thread`, reconciles rollout, calls `GoalService::set_thread_goal`, persists a rollout `ThreadGoalUpdated` item when possible, sends the JSON-RPC response, emits ordered update notification, and applies runtime effects ([`thread_goal_processor.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/app-server/src/request_processors/thread_goal_processor.rs#L97-L157)).
- `thread_goal_get` returns `ThreadGoalGetResponse { goal }`, where goal may be null ([`thread_goal_processor.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/app-server/src/request_processors/thread_goal_processor.rs#L166-L181)).
- `thread_goal_clear` calls `GoalService::clear_thread_goal`, sends `{ cleared }`, and emits `thread/goal/cleared` if state changed ([`thread_goal_processor.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/app-server/src/request_processors/thread_goal_processor.rs#L186-L224)).
- Materialized/saved threads are required. Ephemeral threads produce an invalid request such as `ephemeral thread does not support goals` ([`thread_goal_processor.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/app-server/src/request_processors/thread_goal_processor.rs#L226-L248)).

## GoalService: external/client mutation semantics

`GoalService` is the shared service used by app-server/client-originated mutations. It validates objectives and token budgets, serializes mutation with the runtime using a `goal_state_permit`, accounts in-flight progress before mutation, then writes to storage ([`ext/goal/src/api.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/api.rs#L116-L150)).

Important behavior:

- If an objective is supplied and a goal already exists, it updates the existing row rather than always replacing it; the previous snapshot is retained so runtime effects know whether it changed ([`api.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/api.rs#L152-L183)).
- If no goal exists and an objective is supplied, it calls `replace_thread_goal` with status defaulting to `Active` ([`api.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/api.rs#L184-L198)).
- If no objective is supplied, it requires an existing goal and updates only status/budget ([`api.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/api.rs#L200-L229)).
- Clearing deletes the row and applies runtime clear effects ([`api.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/api.rs#L249-L291)).

## Model-visible tools

When Goals are enabled and tools are visible for the thread, the extension contributes three Responses API tools:

- `get_goal`
- `create_goal`
- `update_goal`

The tool names and specs are defined in [`ext/goal/src/spec.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/spec.rs#L9-L11). Tool visibility is controlled by `GoalRuntimeHandle::tools_visible()` and the extension’s `ToolContributor` ([`extension.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/extension.rs#L426-L462)). Review subagent threads are excluded from goal tools in `on_thread_start` via `tools_available_for_thread` ([`extension.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/extension.rs#L102-L118)).

Tool constraints:

- `create_goal` must be explicitly requested by user/system/developer instruction; it takes `objective` and optional positive `token_budget`; it fails if an unfinished goal exists ([`spec.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/spec.rs#L25-L56), [`tool.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/tool.rs#L181-L216)).
- `update_goal` only accepts `complete` or `blocked`; it explicitly cannot pause, resume, budget-limit, or usage-limit a goal ([`spec.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/spec.rs#L60-L93), [`tool.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/tool.rs#L219-L244)).
- On `complete`, the tool accounts final progress and returns a completion budget report if budget/time data exists ([`tool.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/tool.rs#L236-L289), [`#L417-L434`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/tool.rs#L417-L434)).

## Runtime continuation and accounting

The goal runtime is installed as an extension contributor for thread lifecycle, config changes, turn lifecycle, token usage, tool lifecycle, and tool contribution ([`extension.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/extension.rs#L445-L467)).

Runtime behavior:

- On thread start, it creates/registers a `GoalRuntimeHandle`, records whether Goals are enabled, and determines whether goal tools are available for that thread ([`extension.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/extension.rs#L102-L138)).
- On thread idle, it calls `runtime.continue_if_idle()` ([`extension.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/extension.rs#L153-L166)). `continue_if_idle` checks that tools are visible, reads the current persisted goal, requires status `Active`, creates a continuation steering item, and calls `thread.try_start_turn_if_idle` ([`runtime.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/runtime.rs#L359-L404)).
- On turn start, it starts accounting from the current token usage, skips goal accounting in Plan mode, and marks active/budget-limited goals as active for the turn ([`extension.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/extension.rs#L201-L238)).
- On token usage events, it records token deltas ([`extension.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/extension.rs#L315-L347)).
- On tool finish, it accounts progress unless the tool was blocked/aborted or the tool is `update_goal` itself; if accounting moves the goal to `budget_limited`, it injects budget-limit steering once ([`extension.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/extension.rs#L359-L406)).
- On turn stop/abort, it accounts final active goal progress and finishes accounting for the turn ([`extension.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/extension.rs#L241-L293)).
- On turn errors, usage-limit errors set the goal `UsageLimited`; other terminal errors set it `Blocked` to prevent endless continuation loops ([`extension.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/extension.rs#L295-L313), [`runtime.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/runtime.rs#L253-L324)).

Accounting details:

- Plan mode turns are not token-accounted for goals (`account_tokens` is false for Plan mode) ([`accounting.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/accounting.rs#L55-L72)).
- Token delta is `input_tokens - cached_input_tokens + output_tokens`, not total tokens including cached input or reasoning fields separately ([`accounting.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/accounting.rs#L278-L296)).

## Steering prompts

Continuation and budget-limit behavior is implemented by injecting internal model context fragments from templates.

- `continuation.md` tells the model to continue working toward the active goal, preserve the full objective, work from evidence, keep plans current, audit completion requirement-by-requirement, and only call `update_goal` for `complete` or strict repeated `blocked` conditions ([template](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/templates/goals/continuation.md)).
- `budget_limit.md` tells the model the token budget has been reached, to stop substantive new work, summarize progress/remaining work, and not call `update_goal` unless actually complete ([template](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/templates/goals/budget_limit.md)).
- `objective_updated.md` tells the model the user edited the objective and to pursue the new objective rather than stale work ([template](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/templates/goals/objective_updated.md)).

The Rust glue renders these templates and injects them as `InternalModelContextFragment` with source `goal` ([`steering.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/steering.rs#L35-L46)).

## TUI slash-command UX

The TUI registers `SlashCommand::Goal` with description “set or view the goal for a long-running task” and supports inline args ([`slash_command.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/slash_command.rs#L33-L37), [`#L118-L123`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/slash_command.rs#L118-L123), [`#L151-L162`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/slash_command.rs#L151-L162)).

Current usage string is `Usage: /goal [<objective>|clear|edit|pause|resume]` ([`goal_display.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/goal_display.rs#L1-L5)).

TUI dispatch behavior:

- `/goal` with no args opens the thread goal menu if a thread exists; otherwise it shows usage/help ([`slash_dispatch.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/chatwidget/slash_dispatch.rs#L282-L296)).
- `/goal clear`, `/goal pause`, and `/goal resume` map to clear/status events; without a thread they show usage and “The session must start before you can change a goal” ([`slash_dispatch.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/chatwidget/slash_dispatch.rs#L745-L803)).
- `/goal edit` opens a goal editor ([`slash_dispatch.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/chatwidget/slash_dispatch.rs#L759-L765)).
- `/goal <objective>` creates a `GoalDraft`. If the session has not yet materialized a thread, live submission is queued as parse-slash input so the session can start first; otherwise it sends `SetThreadGoalDraft` with `ConfirmIfExists` ([`slash_dispatch.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/chatwidget/slash_dispatch.rs#L806-L843)).

The app-side TUI actions call app-server methods:

- showing current goal uses `thread_goal_get` and renders a summary, or usage if none exists ([`thread_goal_actions.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/app/thread_goal_actions.rs#L24-L49));
- setting/replacing materializes the draft, optionally clears an existing goal, then calls `thread_goal_set` ([`thread_goal_actions.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/app/thread_goal_actions.rs#L128-L224));
- pausing/resuming calls `thread_goal_set` with only status ([`thread_goal_actions.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/app/thread_goal_actions.rs#L229-L255));
- clearing calls `thread_goal_clear` ([`thread_goal_actions.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/app/thread_goal_actions.rs#L258-L283)).

Replacement confirmation: TUI asks before replacing any non-complete goal; completed goals can be replaced without confirmation ([`thread_goal_actions.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/app/thread_goal_actions.rs#L286-L374)).

Long/pasted/image objective handling: TUI materializes pasted text and local images under `$CODEX_HOME/attachments/<uuid>/...`, appends remote image URLs, and if the final objective exceeds 4,000 chars, writes `goal-objective.md` and replaces the objective with “Read the Codex goal objective file at ... before continuing.” ([`goal_files.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/goal_files.rs#L33-L130)). The editor reverses that reference when it points to the expected attachment path ([`goal_files.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/goal_files.rs#L132-L165)).

Ephemeral/saved-session UX: TUI maps ephemeral-thread errors to: “Goals need a saved session. This session is temporary. Run `codex` to start a saved session, or `codex resume` / `/resume` to reopen one.” ([`thread_goal_actions.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/app/thread_goal_actions.rs#L17-L21), [`#L348-L362`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/app/thread_goal_actions.rs#L348-L362)).

## Desktop / app / SDK implications

The public repository does not contain the closed-source Desktop renderer, but Desktop and IDE integrations use the app-server protocol. Official app docs describe `/goal` in the app composer and a progress row above the composer with pause/resume/edit/clear controls. The app-server implementation supports this through the same `thread/goal/*` methods and notifications.

The Python SDK has a private “logical goal operation” wrapper that demonstrates client-side orchestration over the app-server protocol: it clears any existing goal, sets an active goal, waits for the runtime-generated first turn, routes multiple physical turn notifications as one logical goal stream, and treats `paused`, `blocked`, `usage_limited`, `budget_limited`, `complete`, or cleared as terminal for the logical operation ([`sdk/python/src/openai_codex/client.py`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/sdk/python/src/openai_codex/client.py#L493-L589), [`sdk/python/src/openai_codex/_goal.py`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/sdk/python/src/openai_codex/_goal.py#L20-L84)).

Public GitHub issues show historical Desktop rollout/gating bugs: users reported `/goal` missing from Mac/Windows app autocomplete even when backend APIs existed, and maintainers indicated early builds had TUI-only/under-development support before later app availability. Examples: [#21125](https://github.com/openai/codex/issues/21125), [#22049](https://github.com/openai/codex/issues/22049), [#23978](https://github.com/openai/codex/issues/23978), [#25812](https://github.com/openai/codex/issues/25812). These are important for a spec because the designed API is shared, but actual UI exposure may be version/feature-gate dependent.

## Lifecycle state machine: effective behavior

A practical state model from the implementation:

- **No goal**: `thread/goal/get` returns `goal: null`; `/goal` displays usage/no goal.
- **Active**: runtime may continue automatically when idle; tools are visible; active turn accounting runs.
- **Paused**: set by user/client status update; runtime clears active accounting and does not continue.
- **Blocked**: set by model `update_goal({status:"blocked"})` or terminal non-usage turn error; runtime stops active accounting and does not continue.
- **UsageLimited**: set by runtime when upstream usage-limit error occurs; runtime stops active accounting and does not continue.
- **BudgetLimited**: set by accounting when token budget is reached; budget-limit steering is injected and continuation stops after wrap-up unless the goal is actually complete.
- **Complete**: set by model `update_goal({status:"complete"})`; terminal.
- **Cleared**: row deleted; clients get `thread/goal/cleared`.

Resume semantics: the current runtime only marks idle accounting active again for stored goals whose status is `Active` on thread resume ([`runtime.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/ext/goal/src/runtime.rs#L336-L356)). The TUI separately prompts the user to resume `Paused`, `Blocked`, or `UsageLimited` goals after thread resume ([`thread_goal_actions.rs`](https://github.com/openai/codex/blob/d2484697b1f9ce33d1d818ccad859ca3a4d721c6/codex-rs/tui/src/app/thread_goal_actions.rs#L51-L80)).

## Edge cases and known issues from public reports

Public reports and forum posts identify practical issues to account for in specs/tests:

- Version/feature mismatch: `/goal` could be absent in some 0.128.0/platform builds unless `[features] goals = true` was set, or the installed binary lacked goal strings ([#20548](https://github.com/openai/codex/issues/20548), [#20591](https://github.com/openai/codex/issues/20591)).
- Desktop autocomplete/gating: app builds sometimes had backend `thread/goal/*` support while slash-command autocomplete did not show `/goal` ([#21125](https://github.com/openai/codex/issues/21125), [#23978](https://github.com/openai/codex/issues/23978), [#25812](https://github.com/openai/codex/issues/25812)).
- Stale app-server/config: users saw failures fixed by enabling `goals = true`, updating, restarting all Codex processes, or clearing stale state DB in early versions ([#24269](https://github.com/openai/codex/issues/24269), [#24466](https://github.com/openai/codex/issues/24466)).
- Looping/cost risk: community users reported long-running loops and high token use; the current source contains mitigations such as token budgets, `budget_limited`, usage-limit handling, and blocked audits in the continuation prompt, but this remains a core product risk for long-horizon autonomous work.

## Minimum implementation specification distilled from Codex

A compatible implementation should include:

1. **Feature gate**: a `goals` feature flag that controls command visibility, app-server APIs, runtime, and model tools.
2. **Thread-scoped persistence**: exactly one persisted goal per materialized thread, keyed by thread id, with stable goal id, objective, status, optional token budget, usage counters, and timestamps.
3. **Objective validation**: trim objective at creation/update, reject empty objectives and objectives over 4,000 chars unless materialized to a file/reference by the client.
4. **Status set**: active, paused, blocked, usage_limited, budget_limited, complete.
5. **App-server API**: set/get/clear methods plus updated/cleared notifications, all feature-gated and rejecting ephemeral threads.
6. **User controls**: `/goal`, `/goal <objective>`, `/goal pause`, `/goal resume`, `/goal clear`, and current-source `/goal edit`; replacement confirmation for non-complete goals.
7. **Model tools**: `get_goal`, `create_goal`, `update_goal`; model can create only when explicit and no unfinished goal exists; model can update only to complete/blocked.
8. **Runtime continuation**: when a goal is active and the thread becomes idle, inject a continuation prompt and start a new turn if possible.
9. **Accounting**: track wall-clock and uncached input + output token deltas; persist increments during tool completions and turn end; mark budget-limited when token budget is reached.
10. **Safety stops**: usage-limit errors become `usage_limited`; terminal turn errors become `blocked`; budget exhaustion injects wrap-up steering; blocked requires repeated-blocker audit in prompt/tool guidance.
11. **Notifications/UI sync**: all clients must listen for `thread/goal/updated`/`cleared` because model tools, TUI commands, Desktop controls, and SDK operations can all mutate goal state.
12. **Saved-thread requirement**: ephemeral threads cannot use goals; clients should surface a clear saved-session requirement.

## Files most relevant for further verification

- Persistence: `codex-rs/state/src/runtime/goals.rs`, `codex-rs/state/src/model/thread_goal.rs`, migrations `0029` and `0033`.
- Protocol/API: `codex-rs/app-server-protocol/src/protocol/v2/thread.rs`, `codex-rs/app-server/src/request_processors/thread_goal_processor.rs`.
- Service/runtime/tools: `codex-rs/ext/goal/src/api.rs`, `runtime.rs`, `extension.rs`, `tool.rs`, `spec.rs`, `steering.rs`.
- Prompts: `codex-rs/ext/goal/templates/goals/*.md`.
- TUI UX: `codex-rs/tui/src/chatwidget/slash_dispatch.rs`, `app/thread_goal_actions.rs`, `goal_display.rs`, `goal_files.rs`, `bottom_pane/slash_commands.rs`.
- Client orchestration example: `sdk/python/src/openai_codex/client.py`, `sdk/python/src/openai_codex/_goal.py`.
