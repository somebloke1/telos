# Goal-Chain Curator/Distiller Cooperation Spec

Status: Proposed

## Purpose

This spec records the intended cooperation between the goal-chain embedder/curator and the async reproductive-clause distiller.

The current implementation has live async distillation and a curator configuration surface. It does not yet perform embedding-backed semantic curation. This document defines the target design so future implementation does not blur retrieval, reasoning, and mutation responsibilities.

## Background

This design follows from Telos roadmap work on goal-chain cognitive metabolism and async reproductive-clause distillation:

- Cognitive metabolism introduced Hot/Warm/Cold memory, bounded summaries, context entropy metrics, compacted chain rendering, and cold-memory detail lookup.
- Async distillation replaced deterministic/mock mutation logic with a provider-neutral model-backed pipeline. Production mutation is gated by configured model-backed distillation; if unavailable, Telos records `distillation_skipped` and does not mutate.
- Future roadmap work should preserve these memory/metabolism contracts when adding features such as objective templates, smart continuation, clause editing, and progress tracking.

## Design Principles

### Persistent Artifact Hygiene

Persistent project artifacts must not encode transient goal-chain/session-local identifiers such as active chain IDs or bare sub-goal IDs. Ephemeral provenance belongs in goal-chain record space. Durable docs/specs should express stable design rationale, feature names, roadmap themes, or externally meaningful references.

## Design Roles

### Record Space

Record Space is the cold reservoir of historical chain material:

- sub-goal objectives and statuses
- learnings
- record-space entries
- blocked attempts
- inferred sub-goals
- previous mutations
- compacted summaries

It must remain available for detail lookup, but normal chain rendering and model prompts must not carry the full raw history.

### Embedder

The embedder converts candidate evidence into vectors. It is a semantic measurement tool, not a reasoning or mutation mechanism.

Expected provider-neutral inputs:

- active and pending sub-goal objectives
- completed and blocked sub-goal objectives
- learnings
- record-space entry details
- current primary goal
- reproductive-clause principles and mutation guidelines
- anchor files such as `ROADMAP.md`, `README.md`, and selected design docs

The initial configured implementation target is Ollama with `snowflake-arctic-embed2:latest`, but architecture names should remain provider-neutral.

### Curator

The curator uses embeddings and bounded local rules to select relevant evidence from Record Space.

It answers:

> Which historical material should be brought from cold memory into warm memory for this chain state?

It does not answer:

> What should the reproductive clause mutate into?

Expected curator responsibilities:

- rank semantically relevant records and sub-goals against the current chain state
- cluster related evidence without keyword/regex inference
- retain fresh and stable learnings under a context budget
- identify stale, duplicated, or oversized material for cold storage
- expose provenance for selected evidence
- preserve deterministic safe behavior when no equivalent curator is configured

### Distiller

The distiller is the reasoning layer for durable principle extraction.

It answers:

> Given the reproductive clause, fresh learnings, and curated historical evidence, what durable principle changes, if any, are justified?

The distiller must be async because it depends on model I/O. It must return structured data, currently:

- `principles`
- `reason`
- `confidence`

If no distiller is configured, unavailable, or returns no validated principles, Telos records `distillation_skipped` and does not mutate. Deterministic code must not pretend to be LLM reasoning.

### GoalChainManager

The manager validates and applies explicit decisions.

It may:

- compact context
- call a curator
- call a distiller
- validate returned principles
- apply `mutateReproductiveClause()`
- record success or skip diagnostics

It must not:

- infer durable principles from keyword matches
- silently replace unavailable model reasoning with arbitrary deterministic substitutes
- let raw historical walls dominate the normal chain representation

## Intended Runtime Flow

1. Chain activity accumulates in Record Space.
2. Entropy metrics detect large, stale, duplicated, or unbalanced context.
3. Hot memory remains focused on active/pending/current work.
4. Cold memory preserves full historical detail for lookup.
5. The curator semantically retrieves bounded evidence from cold memory into warm memory.
6. `compactGoalChain()` or a future async variant stores a warm summary with curator provenance.
7. `maybeEvolveChainAsync()` passes the reproductive clause, fresh learnings, and curated summary to the distiller.
8. The distiller proposes explicit principle updates with a reason and confidence.
9. The manager validates and applies the mutation, or records `distillation_skipped`.

## Intended Data Shape

A future curated summary should extend `GoalChainContextSummary` with bounded semantic evidence such as:

```ts
interface CuratedEvidenceItem {
  id: string;
  sourceType: "sub_goal" | "record" | "learning" | "anchor";
  sourceId: string;
  text: string;
  relevance: number;
  reason?: string;
}

interface CuratedEvidenceCluster {
  label: string;
  relevance: number;
  evidenceIds: string[];
}
```

The existing `curator` metadata should remain, but it should eventually describe actual retrieval work:

```ts
curator: {
  enabled: true,
  provider: "ollama",
  host: "http://127.0.0.1:11434",
  model: "snowflake-arctic-embed2:latest",
  topK: 8,
  anchorFiles: ["ROADMAP.md", "README.md"],
  selectedEvidenceCount: 8,
  clusters: [...]
}
```

## Inference Cooperation

For inferred sub-goals, the curator should select relevant historical evidence and the reasoner/distiller should propose sub-goals from that evidence.

Inference must not regress to keyword or regex templates such as:

- if primary goal contains "test", suggest tests
- if record contains "blocked", suggest retry

Valid inference is model reasoning over bounded, provenance-backed record-space evidence.

## Non-Goals

- Do not make embeddings mutate the reproductive clause directly.
- Do not use embedding similarity as a confidence substitute for model reasoning.
- Do not expose file paths, persistence details, or vector-cache mechanics to users.
- Do not require live embeddings for safe local compaction.

## Implementation Milestones

1. Add a provider-neutral `GoalChainCurator` interface.
2. Add an `OllamaEmbeddingGoalChainCurator` implementation behind the existing `TELOS_CURATOR_*` config.
3. Add a small vector/cache layer keyed by stable record/sub-goal fingerprints.
4. Add `compactGoalChainAsync()` or an async curation path used before distillation.
5. Add tests proving curator-selected evidence reaches distillation input.
6. Add tests proving no embedding-backed curator configured means deterministic compaction only, not fake semantic retrieval.
7. Add docs and diagnostics showing curator provenance without exposing implementation internals.

## Current Implementation Gap

At the time this spec was written, Telos records curator configuration in compaction summaries but does not call Ollama or compute embeddings. The live model-backed path is the distiller only.
