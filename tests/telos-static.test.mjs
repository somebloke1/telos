import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("GoalChainManager exposes and reuses a persistence snapshot for reload-safe handoff", async () => {
	const source = await readSource("src/goal-chain.ts");

	assert.match(source, /export interface GoalChainPersistenceEntry/);
	assert.match(source, /getPersistenceSnapshot\(\): GoalChainPersistenceEntry/);
	assert.match(source, /schemaVersion:\s*GoalChainManager\.SCHEMA_VERSION/);
	assert.match(source, /chains:\s*this\.getAllGoalChains\(\)/);
	assert.match(source, /pi\.appendEntry\("telos:goal-chains",\s*this\.getPersistenceSnapshot\(\)\)/);
});

test("goal and goal-chain state restore prefers session entries after reload", async () => {
	const goalChainSource = await readSource("src/goal-chain.ts");
	const goalManagerSource = await readSource("src/goal-manager.ts");
	const indexSource = await readSource("src/index.ts");

	assert.match(goalChainSource, /typeof sessionManager\.getEntries === "function"/);
	assert.match(goalChainSource, /sessionManager\.getEntries\(\)/);
	assert.match(goalChainSource, /sessionManager\.getBranch\(\)/);

	assert.match(goalManagerSource, /getEntries\(\)/);
	assert.match(goalManagerSource, /sessionManager\.getBranch\(\)/);

	assert.match(indexSource, /typeof ctx\.sessionManager\.getEntries === "function"/);
	assert.match(indexSource, /ctx\.sessionManager\.getEntries\(\)/);
});

test("/goalchain handoff seeds replacement sessions with chain state and a continuity brief", async () => {
	const source = await readSource("src/index.ts");

	assert.match(source, /case "handoff":/);
	assert.match(source, /performGoalChainHandoff/);
	assert.match(source, /const snapshot = goalChainManager\.getPersistenceSnapshot\(\)/);
	assert.match(source, /sessionManager\.appendCustomEntry\?\.\("telos:goal-chains", snapshot\)/);
	assert.match(source, /TELOS GOAL CHAIN HANDOFF BRIEF/);
	assert.match(source, /Essential principles:/);
	assert.match(source, /Queued sub-goals:/);
	assert.match(source, /Recent record space:/);
	assert.match(source, /get_goal_chain with chain_id/);
});

test("GitHub maintenance workflow grants permissions required by its API calls", async () => {
	const workflow = await readSource(".github/workflows/github-maintenance.yml");
	const script = await readSource(".github/scripts/github-maintenance.mjs");

	assert.match(script, /\/actions\/runs/);
	assert.match(script, /\/issues/);
	assert.match(script, /\/pulls/);
	assert.match(workflow, /permissions:\n(?:  .+\n)*  actions: read\n/);
	assert.match(workflow, /permissions:\n(?:  .+\n)*  contents: write\n/);
	assert.match(workflow, /permissions:\n(?:  .+\n)*  issues: read\n/);
	assert.match(workflow, /permissions:\n(?:  .+\n)*  pull-requests: read\n/);
});

test("GitHub development workflow exposes issue and PR helpers", async () => {
	const packageJson = JSON.parse(await readSource("package.json"));
	const docs = await readSource("docs/github-development.md");

	assert.equal(packageJson.scripts["github:auth"], "gh auth status");
	assert.equal(packageJson.scripts["github:status"], "gh status");
	assert.equal(packageJson.scripts["github:issue"], "gh issue create");
	assert.equal(packageJson.scripts["github:pr"], "gh pr create --fill");
	assert.equal(packageJson.repository.url, "https://github.com/somebloke1/telos");
	assert.match(docs, /npm run github:issue/);
	assert.match(docs, /npm run github:pr/);
	assert.match(docs, /Fixes #<issue>/);
});

test("Type-check workflow does not require an npm lockfile cache", async () => {
	const workflow = await readSource(".github/workflows/type-check.yml");

	assert.match(workflow, /node-version: '24'/);
	assert.doesNotMatch(workflow, /cache: 'npm'/);
});
