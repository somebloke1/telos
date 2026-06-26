# Continuation Halt Postmortem

> Status: Fixed in `fix/goalchain-continuation-halt` (see PR #6, issue #5).
> Applies to: Smart Continuation (v0.5.0-alpha) on the single-goal and goal-chain paths.

## Summary

Goal-chain (and single-goal) auto-continuation silently stopped whenever the
agent finished a turn while the user was away from the keyboard. The
continuation injection never fired and the agent went idle. Issuing
`/goalchain continue <id>` resumed it, but it halted again at the next turn
boundary. Continuations appeared to fire only when the user happened to
interact with the TUI.

## Symptom

From a representative session transcript
(`pi-session-2026-06-25T20-05-35...jsonl`):

- Continuations fired only at 20:07, 22:09, 22:55, 23:00, 23:07 — each
  immediately preceded by user TUI activity (`thinking_level_change` entries).
- A ~39-minute halt (assistant turn at 22:16) and a terminal halt (assistant
  turn at 23:12 — with **5 pending sub-goals** still queued) had no preceding
  user activity and **no continuation**.

The halt reproduced *with actionable sub-goals present*, which rules out the
"no queued work" guard as the primary cause.

## Root Cause

During `turn_end` extension handling, Pi's `isStreaming` is **still `true`**.
It only flips to `false` in `finishRun()`, which runs in the `finally` block of
`runWithLifecycle()` — *after* the awaited `turn_end` event emit resolves.

Telos called `sendUserMessage(...)` with no `streamingBehavior` option, so Pi's
streaming branch threw:

> `Agent is already processing. Specify streamingBehavior ('steer' or
> 'followUp') to queue the message.`

That error was swallowed by the `ctx.sendUserMessage` wrapper, which routes
errors to `runner.emitError` instead of throwing. The net effect: no
continuation message was ever queued, and the agent went idle.

This is why continuations only fired when user TUI activity interleaved and
reset the streaming state at a lucky moment.

### Why `/goalchain continue` worked

`/goalchain continue` runs from **command context** (the agent is idle), so
`isStreaming` is `false` at that point and `sendUserMessage` takes the normal
(non-throwing) path. The bug was specific to the `turn_end`-driven auto path.

## Fix

Deliver every continuation as `{ deliverAs: "followUp" }`.

`followUp` queues into Pi's agent loop, which drains `getFollowUpMessages()`
in its outer loop *after* the inner loop exits but *before* `agent_end` fires
— so the next turn reliably fires regardless of streaming state. (`steer`
would also work via `getSteeringMessages`, but `followUp` gives a cleaner
new-turn boundary.)

Applied to both continuation paths:

- `src/goal-continuation.ts` — `GoalContinuation.triggerNow()` (single-goal)
- `src/index.ts` — `checkGoalChainContinuation()` (goal-chain)

Two additional changes align continuation with the "continuous development
never self-terminates" philosophy (see [docs/goal-philosophy.md](goal-philosophy.md)):

- The `turn_end` chain continuation now passes
  `{ allowWithoutActionableSubGoals: true }`, so it does not self-terminate
  when no sub-goals are queued. Only the user pauses an active chain; a chain
  is never auto-closed.
- The no-actionable-subgoals steering message now directs the model to add or
  infer a next sub-goal, or — when sub-goals stop making a meaningful
  difference — evolve at a more basic level via `mutate_reproductive_clause`
  rather than reporting "no queued work".

### What was NOT the cause

The actionable-subgoals guard (`actionableSubGoals.length === 0` early-return)
was a real but **secondary** gap. It is not the primary halt: the primary halt
reproduced with 5 actionable sub-goals queued. Both are fixed.

## Validation

- Bun transpile check (Pi loads `.ts` via Bun): clean for both files.
- Full test suite: 175 → 177 passing. The 2 new tests lock
  `{ deliverAs: "followUp" }` on the `triggerNow` and `checkContinuation`
  paths.

## Testing Boundary (follow-up)

The *goal-chain* path (`checkGoalChainContinuation` in `src/index.ts`) is a
module-private function: `index.ts` only `export default`s the extension
factory, so the function cannot be imported by a test. The single-goal
`GoalContinuation` path carries the identical root-cause fix and is what the
current regression tests lock.

Locking the chain path directly requires extracting
`checkGoalChainContinuation` into an importable module
(`src/goal-chain-continuation.ts`). That function is a pure module function
with explicit parameters (it is **not** a closure trap — it does not capture
closure variables), so the extraction is low-risk. It is tracked as a
follow-up sub-goal and as the broader "make `index.ts` testable" technical
debt (10 other module-private functions share the same gap).

End-to-end confirmation that the live halt is resolved requires a real Pi
session restart; deterministic tests can only lock the `deliverAs` argument
and the message content, not the full turn lifecycle.

## Timeline

1. **Observe** — continuations stopped on turn boundaries; only resumed on
   `/goalchain continue` or user interaction.
2. **Diagnose** — traced the agent loop (`pi-agent-core/agent-loop.js`) and
   lifecycle (`runWithLifecycle` / `finishRun`) to find that `isStreaming`
   remains `true` during the awaited `turn_end` emit.
3. **Prove** — the session transcript showed continuations firing only after
   user TUI activity, and halts reproducing with actionable sub-goals present.
4. **Fix** — deliver continuations as `followUp`; align self-termination
   semantics.
5. **Lock** — regression tests on the single-goal path; extraction of the
   chain path tracked as follow-up.
