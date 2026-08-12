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

test('the E2E aggregator runs on cancellation and fails the cancelled deploy', () => {
	const gate = readWorkflow('deploy.yml').jobs['e2e-gate'];

	assert.equal(gate.if, 'always()');

	const result = runShell(gate.steps[0].run, {
		env: {
			CHANGES_RESULT: 'success',
			DEPLOY_RESULT: 'cancelled',
			DEPLOY_URL: '',
			QUEUE_RESULT: 'skipped',
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

	assert.deepEqual([...gate.needs].sort(), ['changes', 'deploy', 'e2e', 'queue']);
	assert.equal(gate.steps[0].env.CHANGES_RESULT, '${{ needs.changes.result }}');
	assert.equal(gate.steps[0].env.QUEUE_RESULT, '${{ needs.queue.result }}');

	const failedDetection = runShell(gate.steps[0].run, {
		env: {
			CHANGES_RESULT: 'failure',
			DEPLOY_RESULT: 'skipped',
			DEPLOY_URL: '',
			QUEUE_RESULT: 'skipped',
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
			QUEUE_RESULT: 'skipped',
			E2E_RESULT: 'skipped',
			EVENT_NAME: 'pull_request',
			SKIP_E2E_INPUT: 'false',
		},
	});
	assert.equal(legitimateSkip.status, 0, legitimateSkip.stdout + legitimateSkip.stderr);
});

test('the E2E aggregator fails when the shared-store queue never released the shards', () => {
	const gate = readWorkflow('deploy.yml').jobs['e2e-gate'];
	const gateEnv = {
		CHANGES_RESULT: 'success',
		DEPLOY_RESULT: 'success',
		DEPLOY_URL: 'https://example.expo.app',
		E2E_RESULT: 'skipped',
		EVENT_NAME: 'pull_request',
		SKIP_E2E_INPUT: 'false',
	};

	assert.equal(gate.steps[0].env.QUEUE_RESULT, '${{ needs.queue.result }}');

	// Deploy succeeded and published a URL, but the queue timed out/errored, so
	// the shards never ran. That must read as a failure with an actionable
	// message — not as the generic "URL published but shards skipped".
	for (const queueResult of ['failure', 'cancelled']) {
		const result = runShell(gate.steps[0].run, {
			env: { ...gateEnv, QUEUE_RESULT: queueResult },
		});
		const output = result.stdout + result.stderr;

		assert.notEqual(result.status, 0, output);
		assert.match(output, /shared-store queue did not succeed/);
		assert.doesNotMatch(output, /unbound variable/);
	}

	const missingQueueResult = runShell(gate.steps[0].run, {
		env: gateEnv,
		unsetEnv: ['QUEUE_RESULT'],
	});
	const missingQueueOutput = missingQueueResult.stdout + missingQueueResult.stderr;

	assert.notEqual(missingQueueResult.status, 0, missingQueueOutput);
	assert.doesNotMatch(missingQueueOutput, /unbound variable/);
});

test('the shared-store queue fences queued runs from the previous workflow', () => {
	const workflow = readWorkflow('deploy.yml');
	const queueStep = findStep(workflow, 'queue', '⏳ Wait for the shared dev store to be free');
	const workspace = mkdtempSync(path.join(tmpdir(), 'wcpos-shared-store-queue-'));
	const binDir = path.join(workspace, 'bin');
	mkdirSync(binDir);

	writeFileSync(
		path.join(binDir, 'gh'),
		`#!/usr/bin/env bash
set -eu
endpoint="$2"
case "$endpoint" in
  */actions/runs/1/jobs?*)
    printf '%s\n' '2026-08-12T05:00:00Z'
    ;;
  *status=in_progress*)
    ;;
  *status=queued*)
    [[ " $* " == *" --paginate "* ]] || exit 64
    printf '%s\n' '2'
    ;;
  */actions/runs/2/jobs?*)
    printf '%s\n' '[{"name":"🚀 Deploy","status":"queued","conclusion":null,"started_at":null}]'
    ;;
  *)
    printf 'unexpected gh call: %s\n' "$*" >&2
    exit 65
    ;;
esac
`,
		{ mode: 0o755 }
	);
	writeFileSync(
		path.join(binDir, 'sleep'),
		`#!/usr/bin/env bash
printf 'sleep:%s\n' "$1"
exit 75
`,
		{ mode: 0o755 }
	);

	try {
		const result = runShell(queueStep.run, {
			cwd: workspace,
			env: {
				GH_TOKEN: 'test-token',
				PATH: `${binDir}:${process.env.PATH}`,
				REPO: 'wcpos/monorepo',
				RUN_ID: '1',
			},
		});

		assert.equal(result.status, 75, result.stdout + result.stderr);
		assert.match(result.stdout, /run 2 uses the previous workflow and has not finished/);
		assert.match(result.stdout, /sleep:180/);

		// The queued-runs poll must fence out zombies: a run stuck "queued" for
		// hours (observed: six days) would otherwise block every waiter until
		// its 150-minute timeout. Pinned declaratively — the mock above ignores
		// the jq program, so it can't distinguish filtered from unfiltered.
		assert.match(queueStep.run, /select\(\.created_at > \\"\$queued_cutoff\\"\)/);

		// Same for zombie JOBS (runner death leaves them in_progress forever,
		// observed 3× on 2026-08-12): a store claim older than the shard
		// timeout, or a "waiter" older than the queue's own timeout, must stop
		// blocking the line.
		assert.match(queueStep.run, /select\(\.completed_at > \$cutoff\)/);
		assert.match(queueStep.run, /select\(\.started_at > \$cutoff\)/);
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
});

test('the shared-store queue skips backoff after the final API attempt', () => {
	const workflow = readWorkflow('deploy.yml');
	const queueStep = findStep(workflow, 'queue', '⏳ Wait for the shared dev store to be free');
	const workspace = mkdtempSync(path.join(tmpdir(), 'wcpos-shared-store-retry-'));
	const binDir = path.join(workspace, 'bin');
	const sleepLog = path.join(workspace, 'sleep.log');
	const ghCallLog = path.join(workspace, 'gh.log');
	mkdirSync(binDir);

	writeFileSync(
		path.join(binDir, 'gh'),
		'#!/usr/bin/env bash\nprintf \'%s\\n\' "$1" >> "$GH_CALL_LOG"\nexit 1\n',
		{ mode: 0o755 }
	);
	writeFileSync(
		path.join(binDir, 'sleep'),
		`#!/usr/bin/env bash
printf '%s\\n' "$1" >> "$SLEEP_LOG"
`,
		{ mode: 0o755 }
	);

	try {
		const result = runShell(queueStep.run, {
			cwd: workspace,
			env: {
				GH_TOKEN: 'test-token',
				PATH: `${binDir}:${process.env.PATH}`,
				REPO: 'wcpos/monorepo',
				RUN_ID: '1',
				GH_CALL_LOG: ghCallLog,
				SLEEP_LOG: sleepLog,
			},
		});

		assert.notEqual(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout + result.stderr, /Could not read this run's queue job start time/);
		assert.deepEqual(readFileSync(ghCallLog, 'utf8').trim().split('\n'), ['api', 'api', 'api']);
		assert.deepEqual(readFileSync(sleepLog, 'utf8').trim().split('\n'), ['15', '30']);
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
});

test('the deploy concurrency contract isolates stale rerun attempts', () => {
	const workflow = readWorkflow('deploy.yml');

	// GitHub evaluates workflow concurrency and REST pagination; locally this
	// test pins the declarative contract while hosted Actions exercises it.
	assert.match(workflow.concurrency.group, /deploy-pr-\{0\}-\{1\}/);
	assert.match(workflow.concurrency.group, /github\.event\.pull_request\.number/);
	assert.match(workflow.concurrency.group, /github\.run_attempt != '1'/);
	assert.match(workflow.concurrency.group, /github\.run_id/);
	assert.match(
		findStep(workflow, 'queue', '⏳ Wait for the shared dev store to be free').run,
		/--paginate --jq '\.workflow_runs\[\]\.id'/
	);
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
