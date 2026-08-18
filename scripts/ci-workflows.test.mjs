import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { parse } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readWorkflow(filename) {
	return parse(readFileSync(path.join(ROOT, '.github', 'workflows', filename), 'utf8'));
}

function readAction(filename) {
	return parse(readFileSync(path.join(ROOT, '.github', 'actions', filename), 'utf8'));
}

function findStep(workflow, jobName, stepName) {
	const step = workflow.jobs[jobName].steps.find(({ name }) => name === stepName);
	assert.ok(step, `missing ${stepName} step`);
	return step;
}

function runShell(script, { cwd = ROOT, env = {}, unsetEnv = [] } = {}) {
	const shellEnv = { ...process.env, ...env };
	for (const name of unsetEnv) delete shellEnv[name];

	return spawnSync('bash', ['-c', script], {
		cwd,
		encoding: 'utf8',
		env: shellEnv,
	});
}

test('the shared setup action uses a Node version supported by jsdom 30', () => {
	// Composite-action defaults are evaluated by hosted Actions, so this pins
	// the parsed declarative contract exercised by every setup-monorepo caller.
	const setup = readAction('setup-monorepo/action.yml');

	assert.equal(setup.inputs['node-version'].default, '22.22.2');
});

test('the E2E aggregator runs on cancellation and fails the cancelled deploy', () => {
	const gate = readWorkflow('deploy.yml').jobs['e2e-gate'];

	assert.equal(gate.if, 'always()');

	const result = runShell(gate.steps[0].run, {
		env: {
			CHANGES_RESULT: 'success',
			DEPLOY_RESULT: 'cancelled',
			DEPLOY_URL: '',
			E2E_RESULT: 'skipped',
			EVENT_NAME: 'pull_request',
			SKIP_E2E_INPUT: 'false',
		},
	});

	assert.notEqual(result.status, 0, result.stdout + result.stderr);
	assert.match(result.stdout + result.stderr, /cancelled/);
});

test('the E2E aggregator fails closed when change detection fails', () => {
	const gate = readWorkflow('deploy.yml').jobs['e2e-gate'];

	assert.deepEqual([...gate.needs].sort(), ['changes', 'deploy', 'e2e']);
	assert.equal(gate.steps[0].env.CHANGES_RESULT, '${{ needs.changes.result }}');

	const failedDetection = runShell(gate.steps[0].run, {
		env: {
			CHANGES_RESULT: 'failure',
			DEPLOY_RESULT: 'skipped',
			DEPLOY_URL: '',
			E2E_RESULT: 'skipped',
			EVENT_NAME: 'pull_request',
			SKIP_E2E_INPUT: 'false',
		},
	});
	assert.notEqual(failedDetection.status, 0, failedDetection.stdout + failedDetection.stderr);
	assert.match(failedDetection.stdout + failedDetection.stderr, /Change detection did not succeed/);

	const legitimateSkip = runShell(gate.steps[0].run, {
		env: {
			CHANGES_RESULT: 'success',
			DEPLOY_RESULT: 'skipped',
			DEPLOY_URL: '',
			E2E_RESULT: 'skipped',
			EVENT_NAME: 'pull_request',
			SKIP_E2E_INPUT: 'false',
		},
	});
	assert.equal(legitimateSkip.status, 0, legitimateSkip.stdout + legitimateSkip.stderr);
});

test('the shared-store queue stays removed', () => {
	// The queue job (2026-08-12 → 2026-08-18) starved every merge gate once
	// 2+ PRs were active: holders kept the store 25–45 min, the gate polls a
	// bounded window, and agent evenings queued PRs for hours (#1265). Cross-
	// run safety is the SPECS' job (run-private probe records, relative count
	// assertions, CI retries). If contention flakes reappear, fix that spec's
	// isolation — do not resurrect a cross-run mutex; these pins are the
	// tripwire that makes reintroduction a deliberate, reviewed act.
	const workflow = readWorkflow('deploy.yml');

	assert.ok(!('queue' in workflow.jobs), 'deploy.yml grew a queue job again');
	assert.deepEqual(workflow.jobs.e2e.needs, 'deploy');

	const gate = workflow.jobs['e2e-gate'];
	assert.ok(!('QUEUE_RESULT' in gate.steps[0].env), 'e2e-gate re-grew QUEUE_RESULT');
	assert.doesNotMatch(gate.steps[0].run, /QUEUE_RESULT/);

	// The merge gate must out-wait a full E2E phase: deploy (~6 min) plus a
	// shard running to its 60-minute timeout. 140 × 30s ≈ 70 min. The old
	// 40-minute default timed out on runs that were still legitimately in
	// flight — that, multiplied by the queue, was the doom loop.
	const mergeGate = readWorkflow('merge-gate.yml');
	const gateStep = mergeGate.jobs['merge-gate'].steps.find(
		({ name }) => name === 'Evaluate merge policy'
	);
	assert.equal(gateStep.env.MERGE_GATE_MAX_ATTEMPTS, '140');
});

test('both lanes run four E2E shards', () => {
	// The two-shard main cap (2026-08-18) guarded dev-pro write capacity, but
	// the feared load was the per-test catalogue re-sync removed in #1288.
	// Shard count divides the same test list — it can never change coverage.
	const matrix = readWorkflow('deploy.yml').jobs.e2e.strategy.matrix;

	assert.equal(matrix.shardIndex, "${{ fromJSON('[1, 2, 3, 4]') }}");
	assert.equal(matrix.shardTotal, "${{ fromJSON('[4]') }}");
});

test('cold-start dispatches bind raw refs to an explicit store lane', () => {
	const workflow = readWorkflow('e2e-cold-start.yml');
	const lane = workflow.on.workflow_dispatch.inputs.lane;
	const validateStep = findStep(workflow, 'cold-start', '🔒 Validate trusted ref');
	const runStep = findStep(workflow, 'cold-start', '🥶 Run cold-start E2E');

	assert.equal(lane.required, true);
	assert.equal(lane.default, 'next');
	assert.deepEqual(lane.options, ['main', 'next']);
	assert.match(validateStep.env.E2E_LANE, /github\.event\.inputs\.lane/);
	assert.match(validateStep.run, /origin\/\$E2E_LANE/);
	assert.match(runStep.env.E2E_STORE_URL_PRO, /github\.event\.inputs\.lane == 'main'/);
});

test('the E2E auth-state cache is shard- and lane-scoped', () => {
	// Reused auth states are validated at boot in globalSetup (stale falls back
	// to full auth), but a state restored for the WRONG shard or lane would
	// validate fine and then run every spec against the wrong cashier slot or
	// store. The key must therefore carry both dimensions.
	const step = readWorkflow('deploy.yml').jobs.e2e.steps.find(
		(candidate) => candidate.with && candidate.with.path === 'apps/main/e2e/.auth-state'
	);

	assert.ok(step, 'deploy.yml e2e job no longer caches the auth state');
	assert.match(step.with.key, /shard\$\{\{ matrix\.shardIndex \}\}/);
	assert.match(step.with.key, /'next' \|\| 'main'/);
});

test('the deploy concurrency contract isolates stale rerun attempts', () => {
	const workflow = readWorkflow('deploy.yml');

	// GitHub evaluates workflow concurrency and REST pagination; locally this
	// test pins the declarative contract while hosted Actions exercises it.
	assert.match(workflow.concurrency.group, /deploy-pr-\{0\}-\{1\}/);
	assert.match(workflow.concurrency.group, /github\.event\.pull_request\.number/);
	assert.match(workflow.concurrency.group, /github\.run_attempt != '1'/);
	assert.match(workflow.concurrency.group, /github\.run_id/);
});

test('deploy emits the required E2E check whenever the merge gate runs', () => {
	const deployTypes = readWorkflow('deploy.yml').on.pull_request.types;
	const mergeGateTypes = readWorkflow('merge-gate.yml').on.pull_request_target.types;

	for (const activity of mergeGateTypes) {
		assert.ok(deployTypes.includes(activity), `deploy.yml does not handle ${activity}`);
	}
});

test('apps/main failures are preserved in result files and the PR summary', () => {
	const workspace = mkdtempSync(path.join(tmpdir(), 'wcpos-ci-workflows-'));
	const binDir = path.join(workspace, 'bin');
	const summaryPath = path.join(workspace, 'step-summary.md');
	mkdirSync(path.join(workspace, 'apps', 'main'), { recursive: true });
	mkdirSync(binDir);

	const mockPnpm = path.join(binDir, 'pnpm');
	writeFileSync(
		mockPnpm,
		`#!/usr/bin/env bash
set -u
args="$*"
if [[ "$args" == *"exec jest"* ]]; then
  output=""
  for arg in "$@"; do
    [[ "$arg" == --outputFile=* ]] && output="\${arg#--outputFile=}"
  done
  if [[ -n "$output" ]]; then
    mkdir -p "$MOCK_WORKSPACE/apps/main"
    printf '%s' '{"testResults":[{"status":"failed","assertionResults":[{"status":"failed","ancestorTitles":["Main"],"title":"reports a Jest failure","failureMessages":["jest boom"]}]}]}' > "$MOCK_WORKSPACE/apps/main/$output"
  fi
  exit 1
fi
if [[ "$args" == *"test:plugins"* ]]; then
  printf '%s\n' 'TAP version 13' 'not ok 1 - reports a plugin failure' '  error: plugin boom' '1..1'
  exit 1
fi
exit 64
`,
		{ mode: 0o755 }
	);

	try {
		const workflow = readWorkflow('test.yml');
		const appStep = findStep(workflow, 'unit-tests', '🧪 Run apps/main tests');
		const env = {
			GITHUB_STEP_SUMMARY: summaryPath,
			MOCK_WORKSPACE: workspace,
			PATH: `${binDir}:${process.env.PATH}`,
		};

		const appResult = runShell(appStep.run, { cwd: workspace, env });
		assert.notEqual(appResult.status, 0, 'failing app tests must fail the step');
		assert.ok(readFileSync(path.join(workspace, 'apps/main/test-results.json'), 'utf8'));
		assert.match(
			readFileSync(path.join(workspace, 'apps/main/plugin-test-results.tap'), 'utf8'),
			/plugin boom/
		);

		const summaryStep = findStep(
			workflow,
			'unit-tests',
			'📊 Generate test failure summary'
		);
		const isolatedSummaryScript = summaryStep.run.replaceAll(
			'/tmp/test-summary',
			path.join(workspace, 'test-summary')
		);
		const summaryResult = runShell(isolatedSummaryScript, { cwd: workspace, env });
		assert.equal(summaryResult.status, 0, summaryResult.stdout + summaryResult.stderr);

		const summary = readFileSync(summaryPath, 'utf8');
		assert.match(summary, /@wcpos\/main.*reports a Jest failure/s);
		assert.match(summary, /@wcpos\/main plugins.*plugin boom/s);

		const commentSummary = readFileSync(
			path.join(workspace, 'test-summary', 'failures.md'),
			'utf8'
		);
		assert.match(commentSummary, /reports a Jest failure/);
		assert.match(commentSummary, /plugin boom/);
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
});

test('coverage baseline metadata uses the measured commit date', () => {
	const baseline = JSON.parse(readFileSync(path.join(ROOT, 'coverage-baseline.json'), 'utf8'));
	const measuredCommit = 'd62440926';
	const commitDate = spawnSync(
		'git',
		['show', '-s', '--format=%as', measuredCommit],
		{ cwd: ROOT, encoding: 'utf8' }
	).stdout.trim();

	assert.equal(baseline._updated, commitDate);
	for (const packageName of ['order-math', 'sync-core', 'sync-engine']) {
		assert.match(
			baseline.packages[packageName]._measured,
			new RegExp(`^${commitDate} on next @ ${measuredCommit} —`)
		);
	}
});

test('order-math coverage includes an unimported source module', () => {
	const packageDir = path.join(ROOT, 'packages', 'order-math');
	const probe = path.join(packageDir, 'src', '__coverage-probe__.ts');
	const coverageDir = mkdtempSync(path.join(tmpdir(), 'wcpos-order-math-coverage-'));
	writeFileSync(probe, 'export const coverageProbe = () => 1;\n');

	try {
		const result = spawnSync(
			'pnpm',
			[
				'exec',
				'jest',
				'--ci',
				'--runInBand',
				'--runTestsByPath',
				'src/config.test.ts',
				'--coverage',
				'--coverageReporters=json-summary',
				`--coverageDirectory=${coverageDir}`,
			],
			{ cwd: packageDir, encoding: 'utf8' }
		);
		assert.equal(result.status, 0, result.stdout + result.stderr);

		const summary = JSON.parse(
			readFileSync(path.join(coverageDir, 'coverage-summary.json'), 'utf8')
		);
		const entry = Object.entries(summary).find(([filename]) => filename.endsWith(probe));
		assert.ok(entry, 'the unimported source module is missing from coverage');
		assert.ok(entry[1].statements.total > 0);
		assert.equal(entry[1].statements.covered, 0);
	} finally {
		rmSync(probe, { force: true });
		rmSync(coverageDir, { recursive: true, force: true });
	}
});

test('deploy.yml names BOTH lane stores for the E2E job', () => {
	// The free matrix is opt-in: playwright.config enables it only when a free
	// store is named (it cannot ask which projects `--project=` selected —
	// FullConfig.projects is the full configured list either way). That keeps a
	// pro-only run, like nightly cold-start, from demanding a store it never
	// opens — but it also means a lane that forgets E2E_STORE_URL_FREE loses its
	// free coverage in silence. That is exactly how dev-free coverage vanished
	// for weeks. This pin is where that risk is closed.
	const runStep = readWorkflow('deploy.yml')
		.jobs.e2e.steps.find((step) => step.env && 'E2E_STORE_URL_PRO' in step.env);

	assert.ok(runStep, 'deploy.yml e2e job no longer names a pro store');

	// The free matrix went dark for weeks because this env var silently
	// disappeared (#1277). It is now REQUIRED: a deploy.yml that stops naming
	// the free store fails this test instead of quietly dropping free coverage.
	assert.ok(
		'E2E_STORE_URL_FREE' in runStep.env,
		'deploy.yml e2e job no longer names a free store — the free matrix vanished silently'
	);

	// Each lane maps to its own allowed stores (owner ruling 2026-08-18): main
	// may use dev-free + dev-pro and nothing else; next has only dev-next.
	// Pin the EXACT expressions, arm order included — hostname-presence checks
	// would pass with the lanes swapped, silently gating each lane against the
	// other's store (greptile catch on #1289).
	const nextLane =
		"(inputs.lane == 'next' || (inputs.lane != 'main' && (github.base_ref == 'next' || github.ref_name == 'next')))";
	assert.equal(
		runStep.env.E2E_STORE_URL_PRO,
		"${{ " + nextLane + " && 'https://dev-next.wcpos.com' || 'https://dev-pro.wcpos.com' }}"
	);
	assert.equal(
		runStep.env.E2E_STORE_URL_FREE,
		"${{ " + nextLane + " && 'https://dev-next.wcpos.com' || 'https://dev-free.wcpos.com' }}"
	);
});
