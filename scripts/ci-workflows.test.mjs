import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { parse, parseAllDocuments } from 'yaml';

import { classify } from './ci-plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readWorkflow(filename) {
	return parse(readFileSync(path.join(ROOT, '.github', 'workflows', filename), 'utf8'));
}

function readAction(filename) {
	return parse(readFileSync(path.join(ROOT, '.github', 'actions', filename), 'utf8'));
}

function readMaestroFlow(filename) {
	const documents = parseAllDocuments(
		readFileSync(path.join(ROOT, 'apps', 'main', '.maestro', 'flows', filename), 'utf8')
	);
	return documents.at(-1).toJS();
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

function runLocalNative({ platform, device = 'phone', timestamp = '20260829T120000Z' }) {
	const workspace = mkdtempSync(path.join(tmpdir(), 'wcpos-local-native-'));
	const bin = path.join(workspace, 'bin');
	const trace = path.join(workspace, 'commands.log');
	mkdirSync(bin);
	const command = (name, body) => {
		const filename = path.join(bin, name);
		writeFileSync(filename, `#!/usr/bin/env bash\n${body}\n`);
		chmodSync(filename, 0o755);
	};
	command('curl', 'echo packager-status:running');
	command('date', 'echo "$FIXED_TIMESTAMP"');
	// The runner starts log capture in the BACKGROUND and its EXIT trap kills that
	// process the moment maestro returns — so on a loaded runner the capture stub can
	// be killed before it ever appends its line, and the trace is missing it FOREVER
	// (waiting after spawnSync cannot recover it: the runner already reaped the child).
	// maestro is the runner's foreground, so block here until the capture has recorded
	// itself; that is the only point at which waiting still keeps the child alive.
	command(
		'maestro',
		`echo "maestro $*" >> "$COMMAND_TRACE"
i=0
while [ "$i" -lt 100 ]; do
	grep -q -- "$CAPTURE_TRACE_PATTERN" "$COMMAND_TRACE" && break
	sleep 0.05
	i=$((i + 1))
done`
	);
	command(
		'xcrun',
		`echo "xcrun $*" >> "$COMMAND_TRACE"
if [ "$*" = "simctl list devices booted" ]; then
	printf '%s\n' '    iPhone 16 Pro (11111111-1111-1111-1111-111111111111) (Booted)' '    iPad Pro (22222222-2222-2222-2222-222222222222) (Booted)'
fi`
	);
	command(
		'adb',
		`echo "adb $*" >> "$COMMAND_TRACE"
if [ "$1" = devices ]; then
	printf 'List of devices attached\nemulator-5554\tdevice\n'
fi`
	);

	const result = spawnSync(
		'bash',
		[
			path.join(ROOT, 'scripts', 'e2e-native-local.sh'),
			'--platform',
			platform,
			'--device',
			device,
			'--flow',
			'apps/main/.maestro/flows/01-clean-launch-connect.yml',
			'--no-video',
		],
		{
			cwd: ROOT,
			encoding: 'utf8',
			env: {
				...process.env,
				CAPTURE_TRACE_PATTERN: platform === 'ios' ? 'log stream' : 'logcat -v threadtime',
				COMMAND_TRACE: trace,
				FIXED_TIMESTAMP: timestamp,
				PATH: `${bin}:${process.env.PATH}`,
			},
		}
	);
	const consolePath = result.stdout.match(/^Console log: (.+)$/m)?.[1];
	return {
		result,
		consolePath,
		trace: readFileSync(trace, 'utf8'),
		cleanup: () => {
			if (consolePath) rmSync(path.dirname(consolePath), { recursive: true, force: true });
			rmSync(workspace, { recursive: true, force: true });
		},
	};
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
			COLD_START_RESULT: 'skipped',
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

	assert.deepEqual([...gate.needs].sort(), ['changes', 'cold-start', 'deploy', 'e2e']);
	assert.equal(gate.steps[0].env.CHANGES_RESULT, '${{ needs.changes.result }}');

	const failedDetection = runShell(gate.steps[0].run, {
		env: {
			CHANGES_RESULT: 'failure',
			COLD_START_RESULT: 'skipped',
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
			COLD_START_RESULT: 'skipped',
			DEPLOY_RESULT: 'skipped',
			DEPLOY_URL: '',
			E2E_RESULT: 'skipped',
			EVENT_NAME: 'pull_request',
			SKIP_E2E_INPUT: 'false',
		},
	});
	assert.equal(legitimateSkip.status, 0, legitimateSkip.stdout + legitimateSkip.stderr);
});

test('the main verification ledger maintains one issue and ignores superseded runs', () => {
	const ledger = readWorkflow('deploy.yml').jobs['main-ledger'];
	assert.match(ledger.if, /github\.event_name == 'push'/);
	assert.match(ledger.if, /github\.ref == 'refs\/heads\/main'/);
	assert.ok([ledger.needs].flat().includes('e2e-gate'));

	const workspace = mkdtempSync(path.join(tmpdir(), 'wcpos-main-ledger-'));
	const binDir = path.join(workspace, 'bin');
	const trace = path.join(workspace, 'gh.log');
	mkdirSync(binDir);
	writeFileSync(
		path.join(binDir, 'gh'),
		`#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$GH_TRACE"
if [ "$1 $2" = "issue list" ]; then printf '%s' "$GH_ISSUES"; fi
`,
		{ mode: 0o755 }
	);
	// The job has no checkout, so gh must be told the repo explicitly.
	assert.equal(ledger.steps[0].env.GH_REPO, '${{ github.repository }}');
	assert.ok([ledger.needs].flat().includes('cold-start'), 'ledger must see cold-start too');

	const run = ({ gate, deploy = 'success', e2e = 'success', cold = 'success', issues }) => {
		writeFileSync(trace, '');
		const result = runShell(ledger.steps[0].run, {
			env: {
				PATH: `${binDir}:${process.env.PATH}`,
				GH_TRACE: trace,
				GH_ISSUES: issues,
				GATE_RESULT: gate,
				DEPLOY_RESULT: deploy,
				E2E_RESULT: e2e,
				COLD_START_RESULT: cold,
				SHA: '0123456789abcdef',
				RUN_URL: 'https://github.test/actions/runs/1',
			},
		});
		return { result, trace: readFileSync(trace, 'utf8') };
	};

	try {
		const created = run({ gate: 'failure', issues: '[]' });
		assert.equal(created.result.status, 0, created.result.stdout + created.result.stderr);
		assert.match(created.trace, /issue create .*--label ci:main-red/);

		const refreshed = run({ gate: 'failure', issues: '[{"number":42}]' });
		assert.equal(refreshed.result.status, 0, refreshed.result.stdout + refreshed.result.stderr);
		assert.match(refreshed.trace, /issue comment 42/);
		assert.doesNotMatch(refreshed.trace, /issue create/);

		const closed = run({ gate: 'success', issues: '[{"number":42}]' });
		assert.equal(closed.result.status, 0, closed.result.stdout + closed.result.stderr);
		assert.match(closed.trace, /issue close 42/);

		const alreadyGreen = run({ gate: 'success', issues: '[]' });
		assert.equal(
			alreadyGreen.result.status,
			0,
			alreadyGreen.result.stdout + alreadyGreen.result.stderr
		);
		assert.doesNotMatch(alreadyGreen.trace, /issue (create|comment|close)|label create/);

		const superseded = run({ gate: 'failure', e2e: 'cancelled', issues: '[{"number":42}]' });
		assert.equal(superseded.result.status, 0, superseded.result.stdout + superseded.result.stderr);
		assert.equal(superseded.trace, '');
		assert.match(superseded.result.stdout, /superseded/i);

		// A cancelled cold-start is the same superseded run — never a red ledger.
		const supersededCold = run({ gate: 'failure', cold: 'cancelled', issues: '[]' });
		assert.equal(supersededCold.result.status, 0, supersededCold.result.stdout);
		assert.equal(supersededCold.trace, '');

		// A pending deploy replaced by a newer main push: e2e/cold-start are
		// skipped and the gate is red, but nothing shipped — superseded too.
		const supersededDeploy = run({
			gate: 'failure',
			deploy: 'cancelled',
			e2e: 'skipped',
			cold: 'skipped',
			issues: '[]',
		});
		assert.equal(supersededDeploy.result.status, 0, supersededDeploy.result.stdout);
		assert.equal(supersededDeploy.trace, '');
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
});

test('release workflows require green main with an explicit typed override', () => {
	const build = readWorkflow('build.yml');
	const publish = readWorkflow('publish-web-bundle.yml');
	for (const workflow of [build, publish]) {
		assert.equal(workflow.on.workflow_dispatch.inputs.override_release_gate.default, '');
		assert.match(
			workflow.on.workflow_dispatch.inputs.override_release_gate.description,
			/I accept a red main/
		);
	}

	const buildGate = findStep(build, 'main', '🟢 Require green main verification');
	assert.equal(buildGate.uses, './.github/actions/require-green-main');
	assert.equal(buildGate.with.sha, '${{ github.sha }}');
	assert.equal(buildGate.with.override, '${{ github.event.inputs.override_release_gate }}');
	assert.match(buildGate.if, /profile == 'production'/);
	assert.match(buildGate.if, /profile == 'adhoc'/);

	const publishGate = findStep(publish, 'publish', '🟢 Require green main verification');
	const resolveSha = findStep(publish, 'publish', '🔎 Resolve the requested monorepo SHA');
	assert.equal(publishGate.uses, './.github/actions/require-green-main');
	assert.equal(publishGate.with.override, '${{ github.event.inputs.override_release_gate }}');
	assert.match(publishGate.with.sha, /steps\..+\.outputs\.sha/);
	// The target SHA is resolved through the API, not from a checkout of the
	// target: the gate must run from THIS workflow revision's tree, because an
	// older monorepo_ref would not contain the local action at all.
	assert.match(resolveSha.run, /gh api .*commits\/\$\{MONOREPO_REF\}/);
	const steps = publish.jobs.publish.steps.map(({ name }) => name);
	assert.ok(
		steps.indexOf('🟢 Require green main verification') < steps.indexOf('📥 Check out monorepo'),
		'the release gate must run before monorepo_ref replaces the workspace'
	);
});

test('the release gate requires the push verification of the SHA and fails closed', () => {
	const action = readAction('require-green-main/action.yml');
	assert.equal(action.runs.using, 'composite');
	const step = action.runs.steps.find(({ run }) => run);
	assert.ok(step, 'release gate is missing its shell step');
	// Only the `push` Deploy run on main counts — a PR/preview run of the same
	// SHA verified a preview, not the artifact that ships.
	assert.match(
		step.run,
		/workflows\/deploy\.yml\/runs\?head_sha=\$\{RELEASE_SHA\}&event=push&branch=main/
	);

	const workspace = mkdtempSync(path.join(tmpdir(), 'wcpos-release-gate-'));
	const binDir = path.join(workspace, 'bin');
	mkdirSync(binDir);
	// The fake gh answers the runs query and the jobs query from two env vars.
	writeFileSync(
		path.join(binDir, 'gh'),
		'#!/usr/bin/env bash\ncase "$*" in *"/runs?"*) printf \'%s\' "$GH_RUNS" ;; *"/jobs"*) printf \'%s\' "$GH_JOBS" ;; *) exit 1 ;; esac\n',
		{ mode: 0o755 }
	);
	const gate = (conclusion) => ({ jobs: [{ name: '🎭 E2E Tests', conclusion }] });
	const run = ({ runs = [], jobs = gate('success'), override = '' }) =>
		runShell(step.run, {
			env: {
				PATH: `${binDir}:${process.env.PATH}`,
				GITHUB_REPOSITORY: 'wcpos/monorepo',
				RELEASE_SHA: '0123456789abcdef',
				RELEASE_OVERRIDE: override,
				GH_RUNS: JSON.stringify({ workflow_runs: runs }),
				GH_JOBS: JSON.stringify(jobs),
			},
		});
	const completed = (id, created_at) => ({ id, status: 'completed', created_at });

	try {
		// The NEWEST push run decides, even when an older one failed.
		const success = run({
			runs: [completed(1, '2026-08-28T10:00:00Z'), completed(2, '2026-08-29T10:00:00Z')],
		});
		assert.equal(success.status, 0, success.stdout + success.stderr);
		assert.match(success.stdout, /run 2\)/);

		const failure = run({ runs: [completed(3, '2026-08-29T10:00:00Z')], jobs: gate('failure') });
		assert.notEqual(failure.status, 0);
		assert.match(failure.stdout + failure.stderr, /0123456789abcdef: failure \(run 3\)/);
		assert.match(failure.stdout + failure.stderr, /I accept a red main/);

		const inProgress = run({
			runs: [{ id: 4, status: 'in_progress', created_at: '2026-08-29T11:00:00Z' }],
		});
		assert.notEqual(inProgress.status, 0);
		assert.match(inProgress.stdout + inProgress.stderr, /still in_progress \(run 4\)/);

		const missing = run({});
		assert.notEqual(missing.status, 0);
		assert.match(missing.stdout + missing.stderr, /no main verification found/);

		const overridden = run({ override: 'I accept a red main' });
		assert.equal(overridden.status, 0, overridden.stdout + overridden.stderr);
		assert.match(overridden.stdout, /::warning::release gate overridden/);
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
});

test('native E2E pull requests are planned and restricted to trusted non-draft changes', () => {
	const workflow = readWorkflow('e2e-native.yml');
	const planner = workflow.jobs.changes.steps.find(
		(step) => step.uses === './.github/actions/ci-plan'
	);

	assert.deepEqual(workflow.on.pull_request.types, [
		'opened',
		'synchronize',
		'reopened',
		'ready_for_review',
	]);
	assert.ok(planner, 'e2e-native.yml changes job does not use the shared planner');
	assert.equal(planner.with['base-sha'], '${{ github.event.pull_request.base.sha }}');
	assert.match(workflow.jobs.build.if, /needs\.changes\.outputs\.native != 'none'/);
	assert.match(workflow.jobs.build.if, /github\.actor != 'dependabot\[bot\]'/);
	assert.match(
		workflow.jobs.build.if,
		/github\.event\.pull_request\.head\.repo\.full_name == github\.repository/
	);
});

test('native E2E routes next-target PRs to the next store', () => {
	const workflow = readWorkflow('e2e-native.yml');

	assert.equal(
		workflow.env.E2E_STORE_URL,
		"${{ github.event_name == 'pull_request' && github.base_ref == 'next' && 'https://dev-next.wcpos.com' || 'https://dev-pro.wcpos.com' }}"
	);

	const seed = spawnSync(
		process.execPath,
		[
			'--input-type=module',
			'--eval',
			"globalThis.fetch = async () => new Response(null, { status: 503 }); await import('./scripts/e2e-native-seed.mjs');",
		],
		{
			cwd: ROOT,
			encoding: 'utf8',
			env: {
				...process.env,
				E2E_STORE_URL: 'https://dev-next.wcpos.com',
				E2E_PRODUCT_WRITER_USER: 'writer',
				E2E_PRODUCT_WRITER_PASS: 'password',
			},
		}
	);

	assert.notEqual(seed.status, 0);
	assert.match(seed.stderr, /Store unreachable: https:\/\/dev-next\.wcpos\.com → HTTP 503/);
});

test('native E2E concurrency is isolated per pull request', () => {
	const { concurrency } = readWorkflow('e2e-native.yml');

	assert.match(concurrency.group, /github\.event\.pull_request\.number/);
	assert.notEqual(concurrency.group, '${{ github.workflow }}');
});

test('native E2E reports logger and direct console errors on both platforms', () => {
	const workflow = readWorkflow('e2e-native.yml');
	const workspace = mkdtempSync(path.join(tmpdir(), 'wcpos-native-errors-'));
	const loggerError =
		'08-29 00:38:12.282 E unknown:ReactNative: console.error: 12:38:11 AM | ERROR : Error | Context: {"errorCode":"SYNC321"}, stack:';
	// `console.error:` is the real Android wire prefix captured in run 33222749557.
	const directError =
		'08-29 00:38:13.282 E unknown:ReactNative: console.error: WebView error: transport failed, stack:';

	try {
		for (const [jobName, logName] of [
			['android', 'logcat.txt'],
			['ios', 'app-console.log'],
		]) {
			const maestroDir = path.join(workspace, jobName, '.maestro', 'tests');
			const summaryPath = path.join(workspace, `${jobName}-summary.md`);
			mkdirSync(maestroDir, { recursive: true });
			writeFileSync(path.join(maestroDir, logName), `${loggerError}\n${directError}\n`);

			const step = findStep(workflow, jobName, '🔴 Surface app errors');
			const script = step.run
				.replaceAll('${{ matrix.device.name }}', 'phone')
				.replaceAll('/tmp/apperr', path.join(workspace, `${jobName}-apperr`))
				.replaceAll('/tmp/app-errors', path.join(workspace, `${jobName}-app-errors`));
			const result = runShell(script, {
				env: {
					GITHUB_STEP_SUMMARY: summaryPath,
					HOME: path.join(workspace, jobName),
					RUNNER_OS: jobName === 'android' ? 'Linux' : 'macOS',
				},
			});

			assert.equal(result.status, 0, result.stdout + result.stderr);
			assert.match(result.stdout, /ERROR : Error/);
			assert.match(result.stdout, /console\.error: WebView error: transport failed/);
			assert.match(readFileSync(summaryPath, 'utf8'), /App errors logged during this run \(2\)/);
		}
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
});

// A PASS with an absurd duration is a FAILURE. Run 33243418607 reported
// `[Passed] 03-authenticated-relaunch (45m 53s)` — a flow whose healthy time is
// 14-45 SECONDS — as green, beside a ::warning:: nobody read. The verdict and
// the duration are two independent pieces of evidence, and a tool's verdict is
// not the truth about the system.
function runTimingTriage(workflow, jobName, suiteLogContents) {
	const workspace = mkdtempSync(path.join(tmpdir(), 'wcpos-native-timing-'));
	try {
		const maestroDir = path.join(workspace, '.maestro', 'tests');
		mkdirSync(maestroDir, { recursive: true });
		writeFileSync(path.join(maestroDir, 'suite.log'), suiteLogContents);
		const summaryPath = path.join(workspace, 'summary.md');
		writeFileSync(summaryPath, '');

		const step = findStep(workflow, jobName, '🕒 Flow timing triage');
		const script = step.run.replaceAll('${{ matrix.device.name }}', 'phone');
		const result = runShell(script, {
			env: { GITHUB_STEP_SUMMARY: summaryPath, HOME: workspace },
		});
		return { result, summary: readFileSync(summaryPath, 'utf8') };
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
}

test('a flow that passes absurdly slowly FAILS the job', () => {
	const workflow = readWorkflow('e2e-native.yml');

	for (const jobName of ['android', 'ios']) {
		// Verbatim from run 33243418607 — green, and 60x its healthy duration.
		const { result, summary } = runTimingTriage(
			workflow,
			jobName,
			'[Passed] 01-clean-launch-connect (1m 10s)\n' +
				'[Passed] 03-authenticated-relaunch (45m 53s)\n'
		);

		assert.notEqual(
			result.status,
			0,
			`${jobName}: a 45m "pass" must fail the job — green is not healthy`
		);
		assert.match(result.stdout, /::error title=absurd flow duration::/);
		assert.match(result.stdout, /03-authenticated-relaunch took 45m 53s/);
		// The healthy flow is not implicated.
		assert.doesNotMatch(result.stdout, /01-clean-launch-connect took/);
		assert.match(summary, /A pass with an absurd duration is a failure/);
	}
});

test('a suite that died before any flow does NOT fail the timing gate', () => {
	// The gate must fail on absurd durations and on NOTHING else. `grep`
	// finding no timing lines exits 1, so adding `set -o pipefail` here — the
	// reflex, and the right call elsewhere in this workflow (#1662) — would
	// turn "the job died before Maestro finished a flow" into a bogus timing
	// failure that masks the real cause. It is omitted on purpose: awk is the
	// last command in the pipeline, so the gate's exit 1 propagates anyway.
	const workflow = readWorkflow('e2e-native.yml');

	for (const jobName of ['android', 'ios']) {
		const { result } = runTimingTriage(
			workflow,
			jobName,
			'maestro exploded before running anything\n'
		);

		assert.equal(
			result.status,
			0,
			`${jobName}: an unparseable suite log must not fail the timing gate`
		);
		// Anchored to a COMMAND line: the step's comment explains why pipefail
		// is absent, so a bare /set -o pipefail/ matches the explanation.
		const step = findStep(workflow, jobName, '🕒 Flow timing triage');
		assert.doesNotMatch(
			step.run,
			/^[ \t]*set -[a-z]*o[a-z]* pipefail[ \t]*$/m,
			`${jobName}: pipefail turns an empty suite log into a bogus timing failure`
		);
	}
});

test('a healthy suite passes the timing gate', () => {
	// The gate must not fire on ordinary timings, including a legitimately
	// slow-but-sane flow between the warn (600s) and fail (1200s) thresholds.
	const workflow = readWorkflow('e2e-native.yml');

	for (const jobName of ['android', 'ios']) {
		const { result } = runTimingTriage(
			workflow,
			jobName,
			'[Passed] 01-clean-launch-connect (1m 10s)\n' +
				'[Passed] 04-cash-sale (2m 30s)\n' +
				'[Failed] 05-drawer-navigation (11m 00s)\n'
		);

		assert.equal(result.status, 0, `${jobName}: ${result.stdout}${result.stderr}`);
		assert.doesNotMatch(result.stdout, /::error/);
		// 11m is past the starvation threshold but under the gate: warn, not fail.
		assert.match(result.stdout, /::warning title=starvation-shaped::/);
	}
});

test('native E2E extracts app errors WITHOUT a length bound', () => {
	// Two silent-failure scars live in this one expression, and both produced a
	// report that looked like it worked:
	//
	//  * `grep -oE 'ERROR : .{0,300}'` — BSD grep (the macOS runners the iOS
	//    job uses) refuses a repetition count over 255 and the step then reports
	//    NOTHING while exiting 0. GNU grep on the Android runner accepts it, so
	//    it failed on exactly one platform.
	//
	//  * `grep -oE 'ERROR : .{0,200}'` — portable, but it TRUNCATED the answer
	//    mid-word: run 33241496921 captured the root cause of a full night's
	//    diagnosis as `"errorDetail":"Persisted scheduler runner ab` (#1677).
	//
	// So a bounded repetition against the log is banned outright. Capture from
	// the marker to end-of-line instead — no count, portable and complete.
	const workflow = readWorkflow('e2e-native.yml');

	for (const jobName of ['android', 'ios']) {
		const step = findStep(workflow, jobName, '🔴 Surface app errors');

		assert.doesNotMatch(
			step.run,
			/grep[^\n]*-o[^\n]*\{0,\d+\}/,
			`${jobName}: bounded-repetition grep truncates app errors — capture to end-of-line`
		);
		assert.match(step.run, /sed -n 's\/\.\*\\\(ERROR : \.\*\\\)\/\\1\/p'/);
	}
});

test('native E2E keeps the whole error line, not a prefix of it', () => {
	// Behavioural, not textual: feed the step the exact line that was truncated
	// in run 33241496921 and assert the decisive word survives. The literal
	// below is 268 characters from `ERROR : `, past both the 200 bound that
	// truncated it and the 255 BSD ceiling.
	const workflow = readWorkflow('e2e-native.yml');
	const workspace = mkdtempSync(path.join(tmpdir(), 'wcpos-native-untruncated-'));
	const longError =
		'08-29 08:16:38.100 E unknown:ReactNative: console.error: 8:16:38 AM | ERROR : Error | Context: ' +
		'{"category":"wcpos.sync.engine","requirementId":"_r_12_:parent:products-browse-window",' +
		'"kind":"query","durationMs":561,"errorName":"Error",' +
		'"errorDetail":"Persisted scheduler runner aborted",' +
		'"type":"coverage.require.error","collection":"products","errorCode":"SYNC321"}';

	try {
		for (const [jobName, logName] of [
			['android', 'logcat.txt'],
			['ios', 'app-console.log'],
		]) {
			const maestroDir = path.join(workspace, jobName, '.maestro', 'tests');
			const summaryPath = path.join(workspace, `${jobName}-summary.md`);
			mkdirSync(maestroDir, { recursive: true });
			writeFileSync(path.join(maestroDir, logName), `${longError}\n`);

			const step = findStep(workflow, jobName, '🔴 Surface app errors');
			const script = step.run
				.replaceAll('${{ matrix.device.name }}', 'phone')
				.replaceAll('/tmp/apperr', path.join(workspace, `${jobName}-apperr`))
				.replaceAll('/tmp/app-errors', path.join(workspace, `${jobName}-app-errors`));
			const result = runShell(script, {
				env: {
					GITHUB_STEP_SUMMARY: summaryPath,
					HOME: path.join(workspace, jobName),
					RUNNER_OS: jobName === 'android' ? 'Linux' : 'macOS',
				},
			});

			assert.equal(result.status, 0, result.stdout + result.stderr);
			// The word the 200-char bound sliced off, and the tail after it.
			const summary = readFileSync(summaryPath, 'utf8');
			assert.match(summary, /Persisted scheduler runner aborted/, `${jobName}: truncated`);
			assert.match(summary, /SYNC321/, `${jobName}: lost the trailing error code`);
		}
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
});

test('the local native runner gives same-second runs separate artifact directories', () => {
	const timestamp = '20260829T120000Z';
	const first = runLocalNative({ platform: 'ios', timestamp });
	const second = runLocalNative({ platform: 'ios', timestamp });

	try {
		assert.equal(first.result.status, 0, first.result.stdout + first.result.stderr);
		assert.equal(second.result.status, 0, second.result.stdout + second.result.stderr);
		assert.ok(first.consolePath);
		assert.ok(second.consolePath);
		assert.notEqual(first.consolePath, second.consolePath);
		assert.match(first.consolePath, new RegExp(`${timestamp}-\\d+/app-console\\.log$`));
		assert.match(second.consolePath, new RegExp(`${timestamp}-\\d+/app-console\\.log$`));
	} finally {
		first.cleanup();
		second.cleanup();
	}
});

test('the local iOS runner selects a simulator matching the declared device class', () => {
	const run = runLocalNative({ platform: 'ios', device: 'tablet' });

	try {
		assert.equal(run.result.status, 0, run.result.stdout + run.result.stderr);
		assert.match(run.result.stdout, /22222222-2222-2222-2222-222222222222 \(tablet\)/);
		assert.match(run.trace, /maestro --udid 22222222-2222-2222-2222-222222222222/);
	} finally {
		run.cleanup();
	}
});

test('the local Android runner clears retained logcat entries before capture', () => {
	const run = runLocalNative({ platform: 'android' });

	try {
		assert.equal(run.result.status, 0, run.result.stdout + run.result.stderr);
		const commands = run.trace.split('\n');
		const clear = commands.indexOf('adb -s emulator-5554 logcat -c');
		const capture = commands.indexOf('adb -s emulator-5554 logcat -v threadtime');
		assert.notEqual(clear, -1, run.trace);
		assert.notEqual(capture, -1, run.trace);
		assert.ok(clear < capture, run.trace);
	} finally {
		run.cleanup();
	}
});

test('both native platforms record the screen for the whole run', () => {
	// Maestro saves ONE screenshot, at the moment of failure. Every CI
	// diagnosis is therefore backwards inference from an end state, and a still
	// is easy to misread — the same frame was read as a dev-launcher home
	// screen and as a slow product search before it turned out to be a red box
	// over a fully loaded POS (#1677). A recording is a background process and
	// ~50MB of artifact; it is the cheapest diagnostic in the suite.
	const workflow = readWorkflow('e2e-native.yml');

	const iosCapture = findStep(workflow, 'ios', '📱 Boot simulator and install app');
	assert.match(iosCapture.run, /simctl io "\$UDID" recordVideo/);
	assert.match(iosCapture.run, /--force/);

	// SIGINT, not SIGKILL: simctl finalizes the container on interrupt and a
	// killed recording uploads as an unplayable file, which is indistinguishable
	// from a recording that never ran.
	const finalize = findStep(workflow, 'ios', '🎬 Finalize screen recording');
	assert.match(finalize.run, /pkill -INT -f 'simctl io \.\* recordVideo'/);
	assert.equal(finalize.if, 'always()');

	// The Android emulator step carries its shell in `with.script`, and the
	// emulator-runner action executes that script LINE BY LINE, each line its
	// own `sh -c`. A continuation backslash there becomes a literal maestro
	// argument (run 33153806439), so the recorder must be a single line.
	const androidCapture = findStep(workflow, 'android', '📱 Run Maestro suite on emulator');
	const androidScript = androidCapture.with.script;
	assert.match(androidScript, /screenrecord/);
	const recorderLine = androidScript
		.split('\n')
		.find((line) => line.trimStart().startsWith('nohup sh -c') && line.includes('screenrecord'));
	assert.ok(recorderLine, 'missing executable Android screenrecord command');
	assert.doesNotMatch(
		recorderLine,
		/\\$/,
		'the screen recorder must be ONE line — a trailing backslash becomes a maestro argument'
	);
	assert.match(recorderLine, /screenrecord-loop\.pid/);
	assert.match(recorderLine, /stop-screenrecord/);

	// The emulator action stops the device as soon as its script returns, so the
	// active segment must be interrupted and its wrapper allowed to pull the file
	// before the script's final exit line.
	const androidLines = androidScript.split('\n');
	const finalizeIndex = androidLines.findIndex(
		(line) => line.includes('stop-screenrecord') && line.includes('pidof screenrecord')
	);
	const exitIndex = androidLines.findIndex((line) => line.includes('exit "$(cat'));
	assert.notEqual(finalizeIndex, -1, 'missing Android screenrecord finalization command');
	assert.ok(
		finalizeIndex < exitIndex,
		'Android screenrecord must finalize before the action exits'
	);
	assert.match(androidLines[finalizeIndex], /kill -2/);
	assert.match(androidLines[finalizeIndex], /kill -0/);
	assert.match(androidLines[finalizeIndex], /SCREENRECORD_SIGNALLED/);
});

test('native E2E searches every issue-comment page for its sticky report', () => {
	const workflow = readWorkflow('e2e-native.yml');
	const step = findStep(workflow, 'app-errors', '💬 Comment when the app logged errors');

	assert.match(
		step.with.script,
		/await github\.paginate\(\s*github\.rest\.issues\.listComments,\s*\{[^}]*per_page: 100[^}]*\}\s*\)/s
	);
});

test('web E2E bounds and deduplicates app errors when they arrive', () => {
	const watcher = readFileSync(path.join(ROOT, 'apps', 'main', 'e2e', 'test.ts'), 'utf8');

	assert.match(watcher, /const errors = new Set<string>\(\)/);
	assert.match(watcher, /errors\.size < MAX_REPORTED/);
	assert.match(watcher, /errors\.add\(/);
	assert.match(watcher, /additional distinct error\(s\) omitted/);
	assert.doesNotMatch(watcher, /errors\.push\(/);
});

test('the native E2E aggregator fails closed except for legitimate skips', () => {
	const gate = readWorkflow('e2e-native.yml').jobs['native-gate'];
	const baseEnv = {
		CHANGES_RESULT: 'success',
		BUILD_RESULT: 'success',
		ANDROID_RESULT: 'success',
		IOS_RESULT: 'success',
		NATIVE_PLAN: 'cachehit',
		EVENT_NAME: 'pull_request',
		IS_FORK: 'false',
		IS_DRAFT: 'false',
		IS_DEPENDABOT: 'false',
	};
	const runGate = (env) => runShell(gate.steps[0].run, { env: { ...baseEnv, ...env } });

	assert.equal(gate.if, 'always()');
	assert.deepEqual([...gate.needs].sort(), ['android', 'build', 'changes', 'ios']);

	const changesFailed = runGate({ CHANGES_RESULT: 'failure' });
	assert.notEqual(changesFailed.status, 0, changesFailed.stdout + changesFailed.stderr);

	const noNativeTier = runGate({ NATIVE_PLAN: 'none' });
	assert.equal(noNativeTier.status, 0, noNativeTier.stdout + noNativeTier.stderr);
	assert.match(noNativeTier.stdout + noNativeTier.stderr, /skipped/i);

	const fork = runGate({ IS_FORK: 'true' });
	assert.equal(fork.status, 0, fork.stdout + fork.stderr);

	// Dependabot PRs get no repository secrets, so `build` is excluded for them
	// (as in deploy.yml) and the gate must read that as a legitimate skip.
	const dependabot = runGate({ IS_DEPENDABOT: 'true', BUILD_RESULT: 'skipped' });
	assert.equal(dependabot.status, 0, dependabot.stdout + dependabot.stderr);
	assert.match(dependabot.stdout + dependabot.stderr, /skipped/i);

	const buildFailed = runGate({ BUILD_RESULT: 'failure' });
	assert.notEqual(buildFailed.status, 0, buildFailed.stdout + buildFailed.stderr);

	const androidSkipped = runGate({ ANDROID_RESULT: 'skipped' });
	assert.notEqual(androidSkipped.status, 0, androidSkipped.stdout + androidSkipped.stderr);

	const allSucceeded = runGate({});
	assert.equal(allSucceeded.status, 0, allSucceeded.stdout + allSucceeded.stderr);
});

test('the native spend guard charges the builds a run will queue and fails closed on bad data', () => {
	// Money-bearing shell: a fake `eas` on PATH returns EAS_MOCK_BUILDS as the
	// month's build list; the guard decides from the count, the platform's slot
	// cost, and the plan. The ceiling is 20 development builds (10 pairs).
	const workspace = mkdtempSync(path.join(tmpdir(), 'wcpos-native-spend-'));
	const binDir = path.join(workspace, 'bin');
	mkdirSync(binDir);
	writeFileSync(
		path.join(binDir, 'eas'),
		'#!/usr/bin/env bash\n[ "${EAS_MOCK_FAIL:-}" = "1" ] && exit 1\nprintf "%s" "$EAS_MOCK_BUILDS"\n',
		{ mode: 0o755 }
	);
	const step = findStep(
		readWorkflow('e2e-native.yml'),
		'build',
		'💸 Refuse an unrequested EAS build'
	);
	const month = new Date().toISOString().slice(0, 7);
	const builds = (n) =>
		JSON.stringify(Array.from({ length: n }, () => ({ createdAt: `${month}-02T00:00:00Z` })));
	const run = (env) =>
		runShell(step.run, {
			cwd: workspace,
			env: {
				PATH: `${binDir}:${process.env.PATH}`,
				GITHUB_STEP_SUMMARY: path.join(workspace, 'summary.md'),
				PLATFORM: 'all',
				CACHE_KEY: 'e2e-native-devclient-test',
				NATIVE_PLAN: 'rebuild',
				EVENT_NAME: 'pull_request',
				BUILD_CEILING: '20',
				EAS_MOCK_BUILDS: builds(0),
				...env,
			},
		});

	try {
		const dispatch = run({ EVENT_NAME: 'workflow_dispatch' });
		assert.notEqual(dispatch.status, 0, 'a dispatch without build=true must refuse');

		const roomForTwo = run({ EAS_MOCK_BUILDS: builds(18) });
		assert.equal(roomForTwo.status, 0, roomForTwo.stdout + roomForTwo.stderr);

		// 19 + the 2 builds platform=all queues = 21 > 20.
		const oneSlotShort = run({ EAS_MOCK_BUILDS: builds(19) });
		assert.notEqual(oneSlotShort.status, 0, 'platform=all must charge two slots');
		const singlePlatform = run({ EAS_MOCK_BUILDS: builds(19), PLATFORM: 'ios' });
		assert.equal(singlePlatform.status, 0, singlePlatform.stdout + singlePlatform.stderr);

		// A cachehit plan spends under the ceiling (eviction is the common cause) but warns.
		const evicted = run({ NATIVE_PLAN: 'cachehit', EAS_MOCK_BUILDS: builds(3) });
		assert.equal(evicted.status, 0, evicted.stdout + evicted.stderr);
		assert.match(evicted.stdout, /::warning::.*evicted/);

		// Fail closed: eas unavailable, or a build without createdAt.
		assert.notEqual(run({ EAS_MOCK_FAIL: '1' }).status, 0);
		assert.notEqual(run({ EAS_MOCK_BUILDS: '[{"id":"x"}]' }).status, 0);

		// Builds from an earlier month do not count.
		const lastMonth = run({
			EAS_MOCK_BUILDS: JSON.stringify(
				Array.from({ length: 30 }, () => ({ createdAt: '2000-01-01T00:00:00Z' }))
			),
		});
		assert.equal(lastMonth.status, 0, lastMonth.stdout + lastMonth.stderr);
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
});

test('the native E2E aggregator exists under the name the merge gate will require', () => {
	// The check name is the contract: when the five-consecutive-greens bar is
	// met, adding it to MERGE_GATE_REQUIRED_CHECKS is a one-line change and
	// must not need a rename. Until then it is deliberately NOT required —
	// main is red on it today (#1661) and a required red would block every PR.
	const native = readWorkflow('e2e-native.yml').jobs['native-gate'];
	assert.equal(native.name, '📱 Native E2E');

	const workflow = readWorkflow('merge-gate.yml');
	const gateStep = workflow.jobs['merge-gate'].steps.find(
		({ name }) => name === 'Evaluate merge policy'
	);
	const required = gateStep.env.MERGE_GATE_REQUIRED_CHECKS.split('|');
	assert.deepEqual(required, ['🧹 Lint', '🧪 Unit Tests', '🎭 E2E Tests']);
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
	// e2e may depend on `changes` (scope narrowing) and `deploy`, never on a queue.
	const e2eNeeds = [workflow.jobs.e2e.needs].flat();
	assert.ok(e2eNeeds.includes('deploy'), 'e2e no longer waits for the deployment');
	assert.ok(
		!e2eNeeds.some((need) => /queue/i.test(need)),
		'e2e depends on a queue job again — see the ruling above'
	);

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

	// The DEFAULT arm — what an ordinary PR runs. (A spec-only PR deliberately
	// narrows to one shard; that arm is pinned in the scope-narrowing test.)
	assert.match(matrix.shardIndex, /\|\| '\[1, 2, 3, 4\]'/);
	assert.match(matrix.shardTotal, /\|\| '\[4\]'/);
});

test('cold-start verifies the deployed main artifact and participates in the gate', () => {
	const workflow = readWorkflow('deploy.yml');
	const coldStart = workflow.jobs['cold-start'];
	const runStep = findStep(workflow, 'cold-start', '🥶 Run cold-start E2E');
	const gate = workflow.jobs['e2e-gate'];

	assert.ok(coldStart, 'deploy.yml is missing the cold-start job');
	assert.match(coldStart.if, /github\.event_name == 'push'/);
	assert.match(coldStart.if, /github\.ref == 'refs\/heads\/main'/);
	assert.equal(runStep.env.E2E_COLD_START, '1');
	assert.equal(runStep.env.BASE_URL, '${{ needs.deploy.outputs.deployment_url }}');
	assert.equal(runStep.env.E2E_STORE_URL_PRO, 'https://dev-pro.wcpos.com');
	assert.ok(gate.needs.includes('cold-start'));
	assert.equal(gate.steps[0].env.COLD_START_RESULT, '${{ needs.cold-start.result }}');
	assert.equal(
		existsSync(path.join(ROOT, '.github', 'workflows', 'e2e-cold-start.yml')),
		false,
		'the scheduled cold-start workflow still exists'
	);

	const baseEnv = {
		CHANGES_RESULT: 'success',
		DEPLOY_RESULT: 'success',
		DEPLOY_URL: 'https://wcpos.expo.app',
		E2E_RESULT: 'success',
		SKIP_E2E_INPUT: 'false',
	};
	const failedMain = runShell(gate.steps[0].run, {
		env: {
			...baseEnv,
			COLD_START_RESULT: 'failure',
			EVENT_NAME: 'push',
		},
	});
	assert.notEqual(failedMain.status, 0, failedMain.stdout + failedMain.stderr);

	for (const [name, results] of [
		['E2E', { COLD_START_RESULT: 'success', E2E_RESULT: 'cancelled' }],
		['Cold-start', { COLD_START_RESULT: 'cancelled', E2E_RESULT: 'success' }],
	]) {
		const cancelledMain = runShell(gate.steps[0].run, {
			env: { ...baseEnv, ...results, EVENT_NAME: 'push' },
		});
		assert.notEqual(cancelledMain.status, 0, cancelledMain.stdout + cancelledMain.stderr);
		assert.match(cancelledMain.stdout + cancelledMain.stderr, new RegExp(`${name}.*superseded`));
	}

	const skippedPr = runShell(gate.steps[0].run, {
		env: {
			...baseEnv,
			COLD_START_RESULT: 'skipped',
			EVENT_NAME: 'pull_request',
		},
	});
	assert.equal(skippedPr.status, 0, skippedPr.stdout + skippedPr.stderr);

	// A main push whose deploy was legitimately skipped (dependabot actor)
	// deploys nothing, so cold-start is not owed either.
	const skippedDeployOnMain = runShell(gate.steps[0].run, {
		env: {
			...baseEnv,
			DEPLOY_RESULT: 'skipped',
			DEPLOY_URL: '',
			E2E_RESULT: 'skipped',
			COLD_START_RESULT: 'skipped',
			EVENT_NAME: 'push',
		},
	});
	assert.equal(
		skippedDeployOnMain.status,
		0,
		skippedDeployOnMain.stdout + skippedDeployOnMain.stderr
	);
});

test('the E2E auth-state cache is shard- and lane-scoped', () => {
	// Reused auth states are validated at boot in globalSetup (stale falls back
	// to full auth), but a state restored for the WRONG shard or lane would
	// validate fine and then run every spec against the wrong cashier slot or
	// store. The key must therefore carry both dimensions.
	const steps = readWorkflow('deploy.yml').jobs.e2e.steps;
	const step = steps.find(
		(candidate) => candidate.with && candidate.with.path === 'apps/main/e2e/auth-state.enc'
	);

	assert.ok(step, 'deploy.yml e2e job no longer caches the auth state');
	assert.match(step.with.key, /shard\$\{\{ matrix\.shardIndex \}\}/);
	assert.match(step.with.key, /'next' \|\| 'main'/);
	assert.match(step.with['restore-keys'], /shard\$\{\{ matrix\.shardIndex \}\}/);
	assert.match(step.with['restore-keys'], /'next' \|\| 'main'/);

	// The snapshot embeds cashier access+refresh tokens and the repo is public:
	// ONLY ciphertext may be cached. Pin that no step caches the plaintext dir
	// and that both crypto steps are secret-gated.
	assert.ok(
		!steps.some(
			(candidate) => candidate.with && String(candidate.with.path ?? '').includes('.auth-state')
		),
		'a cache step points at the PLAINTEXT auth state — credentials would reach the Actions cache'
	);
	const decrypt = steps.find((candidate) => /Decrypt cached auth state/.test(candidate.name ?? ''));
	const encrypt = steps.find((candidate) =>
		/Encrypt auth state for cache/.test(candidate.name ?? '')
	);
	assert.ok(decrypt && encrypt, 'auth-state crypto steps missing');
	for (const crypto of [decrypt, encrypt]) {
		assert.match(crypto.if ?? '', /E2E_AUTH_CACHE_KEY/);
		assert.match(crypto.run, /openssl enc/);
	}
	assert.match(encrypt.run, /rm -rf e2e\/\.auth-state/);
});

test('the shared CI planner controls both change jobs without workflow path filters', () => {
	// Narrowing is a wall-clock optimisation; it must never be able to turn a
	// real regression into a green run.
	for (const filename of ['deploy.yml', 'test.yml']) {
		const raw = readFileSync(path.join(ROOT, '.github', 'workflows', filename), 'utf8');
		const workflow = readWorkflow(filename);
		const planner = workflow.jobs.changes.steps.find(
			(step) => step.uses === './.github/actions/ci-plan'
		);
		assert.ok(planner, `${filename} changes job does not use the shared planner`);
		assert.equal(planner.with['base-sha'], '${{ github.event.pull_request.base.sha }}');
		assert.doesNotMatch(raw, /dorny\/paths-filter/);
		assert.equal(workflow.on.pull_request.paths, undefined, `${filename} has workflow-level paths`);
	}

	const workflow = readWorkflow('deploy.yml');
	assert.match(workflow.jobs.deploy.if, /needs\.changes\.outputs\.web != 'none'/);
	assert.equal(workflow.jobs.changes.outputs.only_specs, '${{ steps.plan.outputs.only_specs }}');

	// A narrowed run uses ONE shard: spreading two specs over four shards leaves
	// shards with zero tests, and a shard that runs zero tests still exits 0.
	const matrix = workflow.jobs.e2e.strategy.matrix;
	assert.match(matrix.shardIndex, /only_specs != '' && '\[1\]'/);
	assert.match(matrix.shardTotal, /only_specs != '' && '\[1\]'/);
	assert.deepEqual([...workflow.jobs.e2e.needs].sort(), ['changes', 'deploy']);
});

test('every direct script path has an explicit planner rule', () => {
	const scripts = path.join(ROOT, 'scripts');
	for (const filename of readdirSync(scripts, { withFileTypes: true })) {
		if (!filename.isFile()) continue;
		assert.notEqual(classify(`scripts/${filename.name}`), 'fallback', filename.name);
	}
});

test('E2E declares store-health probes and a bounded worker count', () => {
	// 2026-08-19: concurrent runs saturated the shared dev store's PHP pool and
	// every gate went red at global-setup. The stores are deliberately sized like
	// a normal shop, so CI is what gives — and when it still saturates, the run
	// must SAY so rather than let environmental reds read as broken diffs.
	const steps = readWorkflow('deploy.yml').jobs.e2e.steps;
	const probes = steps.filter((step) => /Probe store health/.test(step.name ?? ''));

	assert.equal(probes.length, 2, 'expected a pre-flight and a post-failure store probe');
	for (const probe of probes) {
		assert.match(probe.run, /probe-store-health\.mjs/);
		// Reporting must never gate the run.
		assert.equal(probe['continue-on-error'], true);
	}
	assert.ok(
		probes.some((probe) => probe.if === 'failure()'),
		'no post-failure store probe — a store that saturates mid-run would go unrecorded'
	);
	const preFlight = probes.find((probe) => probe.if !== 'failure()');
	const postFailure = probes.find((probe) => probe.if === 'failure()');
	assert.ok(preFlight && postFailure, 'expected both probe phases');
	assert.equal(postFailure.env.E2E_STORE_URL_FREE, preFlight.env.E2E_STORE_URL_FREE);
	assert.match(postFailure.run, /probe-store-health\.mjs.*E2E_STORE_URL_FREE/);
	assert.match(preFlight.run, /before the tests started/);
	assert.match(postFailure.run, /after the tests failed/);

	// Workers per shard multiply against shard count and concurrent runs.
	const config = readFileSync(
		new URL('../apps/main/playwright.config.ts', import.meta.url),
		'utf8'
	);
	const workers = /workers:[\s\S]{0,200}?process\.env\.CI\s*\n?\s*\?\s*(\d+)/.exec(config);
	assert.ok(workers, 'could not read the CI worker count from playwright.config.ts');
	assert.ok(
		Number(workers[1]) <= 2,
		`CI workers per shard is ${workers[1]}; >2 saturated the shared store on 2026-08-19`
	);
});

test('the deploy concurrency contract isolates stale rerun attempts', () => {
	const workflow = readWorkflow('deploy.yml');

	// GitHub evaluates workflow concurrency and REST pagination; locally this
	// test pins the declarative contract while hosted Actions exercises it.
	assert.match(workflow.concurrency.group, /deploy-pr-\{0\}-\{1\}/);
	assert.match(workflow.concurrency.group, /github\.event\.pull_request\.number/);
	assert.match(workflow.concurrency.group, /github\.run_attempt != '1'/);
	assert.match(workflow.concurrency.group, /github\.run_id/);
	assert.match(workflow.concurrency['cancel-in-progress'], /github\.ref != 'refs\/heads\/main'/);
	// main runs must be able to overlap, or the job-level coalescing below can
	// never fire (review on #1687): the workflow group is run-unique on main.
	assert.match(workflow.concurrency.group, /deploy-main-run-\{0\}', github\.run_id/);

	for (const jobName of ['e2e', 'e2e-report', 'cold-start']) {
		const concurrency = workflow.jobs[jobName].concurrency;
		assert.ok(concurrency, `${jobName} is missing job-level concurrency`);
		assert.match(concurrency.group, /github\.ref == 'refs\/heads\/main'/);
		assert.equal(concurrency['cancel-in-progress'], true);
	}
	assert.match(workflow.jobs.e2e.concurrency.group, /matrix\.shardIndex/);
	// The deploy job serialises on main and is never cancelled in flight.
	const deployConcurrency = workflow.jobs.deploy.concurrency;
	assert.ok(deployConcurrency, 'deploy must serialise on main');
	assert.match(deployConcurrency.group, /'deploy-main-deploy'/);
	assert.equal(deployConcurrency['cancel-in-progress'], false);
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
			RUNNER_TEMP: workspace,
			UNIT_PACKAGES: 'all',
		};

		const appResult = runShell(appStep.run, { cwd: workspace, env });
		assert.notEqual(
			appResult.status,
			0,
			`failing app tests must fail the step\n${appResult.stdout}${appResult.stderr}`
		);
		assert.ok(readFileSync(path.join(workspace, 'apps/main/test-results.json'), 'utf8'));
		assert.match(
			readFileSync(path.join(workspace, 'apps/main/plugin-test-results.tap'), 'utf8'),
			/plugin boom/
		);

		const summaryStep = findStep(workflow, 'unit-tests', '📊 Generate test failure summary');
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
	const commitDate = spawnSync('git', ['show', '-s', '--format=%as', measuredCommit], {
		cwd: ROOT,
		encoding: 'utf8',
	}).stdout.trim();

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
	const runStep = readWorkflow('deploy.yml').jobs.e2e.steps.find(
		(step) => step.env && 'E2E_STORE_URL_PRO' in step.env
	);

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
		'${{ ' + nextLane + " && 'https://dev-next.wcpos.com' || 'https://dev-pro.wcpos.com' }}"
	);
	assert.equal(
		runStep.env.E2E_STORE_URL_FREE,
		'${{ ' + nextLane + " && 'https://dev-next.wcpos.com' || 'https://dev-free.wcpos.com' }}"
	);
});

test('a failing Maestro flow fails the iOS job', () => {
	// The iOS step pipes `maestro … | tee "$log"` so the driver-startup flake
	// can be grepped out of the output. A pipeline's exit status is the LAST
	// command's — `tee` — so without pipefail every flow failure reported
	// success. GitHub's default shell for a `run:` with no `shell:` key is
	// `bash -e {0}`: -e, but NOT -o pipefail. Run 33210992908's iOS phone job
	// failed the first assertion of all seven flows — the app never rendered —
	// and reported SUCCESS.
	//
	// This runs the workflow's REAL script against a maestro that always
	// fails, so the guard cannot drift away from the step it protects.
	const step = findStep(readWorkflow('e2e-native.yml'), 'ios', '📱 Run Maestro suite on simulator');

	const dir = mkdtempSync(path.join(tmpdir(), 'maestro-exit-'));
	try {
		mkdirSync(path.join(dir, 'apps/main/.maestro/flows'), { recursive: true });
		writeFileSync(path.join(dir, 'apps/main/.maestro/flows/01-fake.yml'), '');
		mkdirSync(path.join(dir, 'bin'));
		// Not the "driver not ready in time" text — that is the one failure the
		// step is allowed to retry, and it would mask what this test asserts.
		writeFileSync(path.join(dir, 'bin/maestro'), '#!/bin/sh\necho "Assertion is false"\nexit 1\n');
		spawnSync('chmod', ['+x', path.join(dir, 'bin/maestro')]);

		const result = runShell(step.run, {
			cwd: dir,
			env: { PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`, MAESTRO_UDID: 'fake' },
		});

		assert.notEqual(
			result.status,
			0,
			'the iOS Maestro step exited 0 with a failing flow — tee is swallowing maestro exit status'
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('the iOS step still retries the driver-startup flake', () => {
	// The pipefail fix must not turn the ONE retryable failure into a hard
	// one. A maestro that fails the first call with the driver-startup text
	// and succeeds on the second must leave the step green.
	const step = findStep(readWorkflow('e2e-native.yml'), 'ios', '📱 Run Maestro suite on simulator');

	const dir = mkdtempSync(path.join(tmpdir(), 'maestro-retry-'));
	try {
		mkdirSync(path.join(dir, 'apps/main/.maestro/flows'), { recursive: true });
		writeFileSync(path.join(dir, 'apps/main/.maestro/flows/01-fake.yml'), '');
		mkdirSync(path.join(dir, 'bin'));
		writeFileSync(
			path.join(dir, 'bin/maestro'),
			[
				'#!/bin/sh',
				'C="$TMPDIR_COUNTER"',
				'if [ -f "$C" ]; then exit 0; fi',
				'touch "$C"',
				'echo "iOS driver not ready in time"',
				'exit 1',
				'',
			].join('\n')
		);
		spawnSync('chmod', ['+x', path.join(dir, 'bin/maestro')]);

		const result = runShell(step.run, {
			cwd: dir,
			env: {
				PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
				MAESTRO_UDID: 'fake',
				TMPDIR_COUNTER: path.join(dir, 'called-once'),
			},
		});

		assert.equal(
			result.status,
			0,
			`the driver-startup retry stopped working: ${result.stdout}${result.stderr}`
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('a watchdog kill is never retried, even when the log carries the startup-flake text', () => {
	// `with_deadline` returns 124 after killing a hung maestro. `run_flow`'s
	// only retry greps the captured log for "driver not ready in time" — a hung
	// process that happened to print it must not buy a second deadline's worth
	// of wall clock (CodeRabbit on #1686). This runs the REAL step script against
	// a maestro that prints the retryable text and then hangs.
	const step = findStep(readWorkflow('e2e-native.yml'), 'ios', '📱 Run Maestro suite on simulator');
	// The workflow keeps a plain constant; the test shortens it in the script
	// text and says so, rather than teaching the workflow an env var.
	assert.ok(
		step.run.includes('FLOW_DEADLINE_SECONDS=1200'),
		'the per-flow deadline constant moved — update this substitution'
	);
	const script = step.run.replace('FLOW_DEADLINE_SECONDS=1200', 'FLOW_DEADLINE_SECONDS=2');

	const dir = mkdtempSync(path.join(tmpdir(), 'maestro-watchdog-'));
	try {
		mkdirSync(path.join(dir, 'apps/main/.maestro/flows'), { recursive: true });
		writeFileSync(path.join(dir, 'apps/main/.maestro/flows/01-fake.yml'), '');
		mkdirSync(path.join(dir, 'bin'));
		const counter = path.join(dir, 'calls');
		writeFileSync(
			path.join(dir, 'bin/maestro'),
			[
				'#!/bin/sh',
				'echo "$$" >> "$TMPDIR_COUNTER"',
				'echo "iOS driver not ready in time"',
				'sleep 60',
				'exit 1',
				'',
			].join('\n')
		);
		spawnSync('chmod', ['+x', path.join(dir, 'bin/maestro')]);

		const started = Date.now();
		const result = runShell(script, {
			cwd: dir,
			env: {
				PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
				MAESTRO_UDID: 'fake',
				TMPDIR_COUNTER: counter,
			},
		});
		const elapsed = (Date.now() - started) / 1000;
		const output = `${result.stdout}${result.stderr}`;

		assert.notEqual(result.status, 0, `a killed flow reported success: ${output}`);
		const calls = readFileSync(counter, 'utf8').split('\n').filter(Boolean).length;
		assert.equal(calls, 1, `a killed flow was retried (${calls} maestro invocations): ${output}`);
		assert.match(output, /flow exceeded 2s/, `the watchdog did not report the kill: ${output}`);
		// 2 s deadline + 5 s grace; anything near a minute means the hang leaked
		// through (a `sleep` holding the tee pipe, or a retry).
		assert.ok(elapsed < 30, `the step did not end promptly after the kill (${elapsed}s)`);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('both native platforms upload Maestro artifacts unconditionally', () => {
	// iOS uploaded on failure() while Android uploaded on always(). Combined
	// with the pipe bug above — a job that could not report failure —
	// failure() never fired, so every iOS run collected no screenshots and no
	// UI hierarchy. That is why iOS could fail every assertion of every flow
	// for weeks without leaving a trace. Artifacts are also the only thing
	// that separates "an assertion failed" from "the app never rendered" on a
	// green-but-suspicious run, so both platforms collect them either way.
	const workflow = readWorkflow('e2e-native.yml');

	for (const job of ['android', 'ios']) {
		const upload = workflow.jobs[job].steps.find(
			(step) =>
				step.uses?.startsWith('actions/upload-artifact') && step.with?.name?.includes('maestro')
		);
		assert.ok(upload, `${job} no longer uploads Maestro artifacts`);
		assert.equal(upload.if, 'always()', `${job} collects Maestro artifacts conditionally`);
	}
});

test('both native warm-manifest probes have a finite transfer timeout', () => {
	const workflow = readWorkflow('e2e-native.yml');
	const workspace = mkdtempSync(path.join(tmpdir(), 'wcpos-native-manifest-probe-'));

	try {
		const bin = path.join(workspace, 'bin');
		const trace = path.join(workspace, 'curl-args');
		mkdirSync(bin);
		writeFileSync(path.join(bin, 'curl'), '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$CURL_TRACE"\n');
		chmodSync(path.join(bin, 'curl'), 0o755);

		for (const jobName of ['android', 'ios']) {
			const step = findStep(workflow, jobName, '📦 Start Metro and pre-compile the bundle');
			const loopStart = step.run.indexOf('for _ in 1 2; do');
			const loopEnd = step.run.indexOf('\ndone', loopStart);
			assert.notEqual(loopStart, -1, `${jobName}: missing warm-manifest probe loop`);
			assert.notEqual(loopEnd, -1, `${jobName}: unterminated warm-manifest probe loop`);

			const result = runShell(step.run.slice(loopStart, loopEnd + '\ndone'.length), {
				env: {
					CURL_TRACE: trace,
					PATH: `${bin}:${process.env.PATH}`,
				},
			});
			assert.equal(result.status, 0, result.stdout + result.stderr);
		}

		const invocations = readFileSync(trace, 'utf8').trim().split('\n');
		assert.equal(invocations.length, 4);
		for (const invocation of invocations) {
			assert.match(invocation, /--max-time [1-9][0-9]*/);
		}
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
});

test('both native Metro-log collectors create their artifact directory', () => {
	const workflow = readWorkflow('e2e-native.yml');
	const workspace = mkdtempSync(path.join(tmpdir(), 'wcpos-native-metro-log-'));

	try {
		const source = path.join(workspace, 'metro.log');
		writeFileSync(source, 'metro diagnostics\n');

		for (const jobName of ['android', 'ios']) {
			const home = path.join(workspace, jobName);
			const step = findStep(workflow, jobName, '📜 Collect Metro log');
			const result = runShell(step.run.replace('/tmp/metro.log', source), {
				env: { HOME: home },
			});

			assert.equal(result.status, 0, result.stdout + result.stderr);
			assert.equal(
				readFileSync(path.join(home, '.maestro', 'tests', 'metro.log'), 'utf8'),
				'metro diagnostics\n'
			);
		}
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
});

test('Android tombstone collection runs only after a fatal signal and reports every outcome', () => {
	const step = findStep(readWorkflow('e2e-native.yml'), 'android', '🪦 Collect tombstones');
	const workspace = mkdtempSync(path.join(tmpdir(), 'wcpos-native-tombstones-'));
	const bin = path.join(workspace, 'bin');
	const trace = path.join(workspace, 'commands.log');
	const tests = path.join(workspace, '.maestro', 'tests');
	mkdirSync(bin);
	mkdirSync(tests, { recursive: true });
	// Two bugreport fixtures: one carrying a tombstone, one without.
	const fixtures = path.join(workspace, 'fixtures');
	mkdirSync(path.join(fixtures, 'with', 'FS', 'data', 'tombstones'), { recursive: true });
	mkdirSync(path.join(fixtures, 'without', 'FS', 'data'), { recursive: true });
	writeFileSync(
		path.join(fixtures, 'with', 'FS', 'data', 'tombstones', 'tombstone_00'),
		'signal 11\n'
	);
	writeFileSync(path.join(fixtures, 'without', 'FS', 'data', 'other.txt'), 'x\n');
	for (const name of ['with', 'without']) {
		const zipped = spawnSync('zip', ['-q', '-r', path.join(fixtures, `${name}.zip`), 'FS'], {
			cwd: path.join(fixtures, name),
			encoding: 'utf8',
		});
		assert.equal(zipped.status, 0, zipped.stdout + zipped.stderr);
	}
	writeFileSync(
		path.join(bin, 'timeout'),
		`#!/bin/sh
printf 'timeout %s\\n' "$*" >> "$COMMAND_TRACE"
shift
exec "$@"
`
	);
	writeFileSync(
		path.join(bin, 'adb'),
		`#!/bin/sh
printf 'adb %s\\n' "$*" >> "$COMMAND_TRACE"
if [ "$1" = bugreport ]; then
  if [ "\${BUGREPORT_FAIL:-0}" = 1 ]; then exit 1; fi
  cp "$BUGREPORT_FIXTURE" "$2"
fi
exit 0
`
	);
	for (const command of ['timeout', 'adb']) chmodSync(path.join(bin, command), 0o755);

	const run = (env = {}) =>
		runShell(step.run, {
			env: {
				HOME: workspace,
				PATH: `${bin}:${process.env.PATH}`,
				COMMAND_TRACE: trace,
				BUGREPORT_FIXTURE: path.join(fixtures, 'with.zip'),
				...env,
			},
		});

	try {
		// No fatal signal: nothing is collected and adb is never called.
		writeFileSync(
			path.join(tests, 'logcat.txt'),
			'I ActivityManager: Displayed com.wcpos.main.dev\n'
		);
		const quiet = run();
		assert.equal(quiet.status, 0, quiet.stdout + quiet.stderr);
		assert.match(quiet.stdout, /no fatal signal in logcat/);
		assert.ok(!existsSync(trace), 'adb must not run when logcat shows no fatal signal');

		writeFileSync(
			path.join(tests, 'logcat.txt'),
			'F libc    : Fatal signal 11 (SIGSEGV), code 2 (SEGV_ACCERR) in tid 1 (mqt_v_js)\n'
		);
		const failed = run({ BUGREPORT_FAIL: '1' });
		assert.equal(failed.status, 0, failed.stdout + failed.stderr);
		assert.match(failed.stdout, /adb bugreport failed/);

		const empty = run({ BUGREPORT_FIXTURE: path.join(fixtures, 'without.zip') });
		assert.equal(empty.status, 0, empty.stdout + empty.stderr);
		assert.match(empty.stdout, /had no tombstones/);

		const collected = run();
		assert.equal(collected.status, 0, collected.stdout + collected.stderr);
		assert.match(collected.stdout, /tombstone_00/);
		assert.ok(existsSync(path.join(tests, 'tombstones', 'tombstone_00')));
		assert.ok(
			!existsSync(path.join(tests, 'bugreport.zip')),
			'the bugreport zip is not kept in the artifact'
		);
		assert.match(readFileSync(trace, 'utf8'), /timeout 600 adb bugreport/);
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
});

test('no Maestro flow declares a default for a variable the runners pass with -e', () => {
	// Maestro 2.6.1 emits a flow's `env:` block as a second `Define variables`
	// command that runs AFTER the CLI's `-e` vars and SHADOWS them, so a flow-level
	// default silently wins over the value CI passes. Run 33297473431 logged
	// `DefineVariablesCommand(env={… DEVICE_CLASS=tablet …})` then
	// `DefineVariablesCommand(env={DEVICE_CLASS=auto})` and skipped the tablet
	// guard; the same run's flow 07 was passed VARIABLE_PRODUCT_ID=107940 and still
	// evaluated `idRegex=variable-product-tile-.*`. A CLI-passed variable therefore
	// must not have a flow-level default anywhere.
	const cliPassed = new Set();
	for (const source of [
		readFileSync(path.join(ROOT, '.github', 'workflows', 'e2e-native.yml'), 'utf8'),
		readFileSync(path.join(ROOT, 'scripts', 'e2e-native-local.sh'), 'utf8'),
	]) {
		for (const [, name] of source.matchAll(/-e\s+([A-Z][A-Z0-9_]*)=/g)) cliPassed.add(name);
	}

	assert.ok(cliPassed.has('DEVICE_CLASS'), 'the runners no longer pass DEVICE_CLASS with -e');

	const flowsDir = path.join(ROOT, 'apps', 'main', '.maestro', 'flows');
	const offenders = [];
	for (const filename of readdirSync(flowsDir).filter((name) => name.endsWith('.yml'))) {
		const documents = parseAllDocuments(readFileSync(path.join(flowsDir, filename), 'utf8'));
		if (documents.length < 2) continue; // no front-matter, so no env block
		const declared = documents[0].toJS()?.env ?? {};
		for (const name of Object.keys(declared)) {
			if (cliPassed.has(name)) offenders.push(`${filename}: ${name}`);
		}
	}

	assert.deepEqual(
		offenders,
		[],
		'a flow-level env default shadows the value the runners pass with -e'
	);
});

test('Android clean-start flows dismiss a queued system ANR before waiting for Expo', () => {
	for (const filename of ['01-clean-launch-connect.yml', '02-auth-setup.yml']) {
		const flow = readMaestroFlow(filename);
		const androidLaunch = flow.find((command) => command.runFlow?.when?.platform === 'Android')
			.runFlow.commands;

		assert.deepEqual(
			androidLaunch[0],
			{ tapOn: { text: 'Wait', optional: true } },
			`${filename} must clear an ANR dialog that predates hide_error_dialogs`
		);
	}
});

test('the Android step retries a transient offline ADB transport once', () => {
	const step = findStep(
		readWorkflow('e2e-native.yml'),
		'android',
		'📱 Run Maestro suite on emulator'
	);
	const retry = step.with.script
		.split('\n')
		.find((line) => line.includes("grep -Rqs 'device offline'"));

	assert.ok(retry, 'the Android Maestro step no longer retries a transient offline transport');

	const dir = mkdtempSync(path.join(tmpdir(), 'maestro-android-retry-'));
	try {
		mkdirSync(path.join(dir, '.maestro/tests/first-run'), { recursive: true });
		writeFileSync(path.join(dir, '.maestro/tests/first-run/maestro.log'), 'device offline\n');
		writeFileSync(path.join(dir, '.maestro/tests/exit_code'), '1\n');
		mkdirSync(path.join(dir, 'bin'));
		writeFileSync(path.join(dir, 'bin/adb'), '#!/bin/sh\nexit 0\n');
		writeFileSync(
			path.join(dir, 'bin/maestro'),
			'#!/bin/sh\necho called >> "$MAESTRO_RETRY_COUNTER"\nexit 0\n'
		);
		spawnSync('chmod', ['+x', path.join(dir, 'bin/adb'), path.join(dir, 'bin/maestro')]);

		const counter = path.join(dir, 'retry-count');
		const result = runShell(retry, {
			env: {
				HOME: dir,
				PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
				MAESTRO_RETRY_COUNTER: counter,
				DEVICE_CLASS: 'phone',
			},
		});

		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.equal(readFileSync(counter, 'utf8'), 'called\n');
		assert.equal(readFileSync(path.join(dir, '.maestro/tests/exit_code'), 'utf8'), '0\n');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('the Android step does not retry a successful run with a stale offline log', () => {
	const step = findStep(
		readWorkflow('e2e-native.yml'),
		'android',
		'📱 Run Maestro suite on emulator'
	);
	const retry = step.with.script
		.split('\n')
		.find((line) => line.includes("grep -Rqs 'device offline'"));

	assert.ok(retry, 'the Android Maestro step no longer has its retry decision');

	const dir = mkdtempSync(path.join(tmpdir(), 'maestro-android-no-retry-'));
	try {
		mkdirSync(path.join(dir, '.maestro/tests/first-run'), { recursive: true });
		writeFileSync(path.join(dir, '.maestro/tests/first-run/maestro.log'), 'device offline\n');
		writeFileSync(path.join(dir, '.maestro/tests/exit_code'), '0\n');
		mkdirSync(path.join(dir, 'bin'));
		writeFileSync(path.join(dir, 'bin/adb'), '#!/bin/sh\nexit 0\n');
		writeFileSync(
			path.join(dir, 'bin/maestro'),
			'#!/bin/sh\necho called >> "$MAESTRO_RETRY_COUNTER"\nexit 0\n'
		);
		spawnSync('chmod', ['+x', path.join(dir, 'bin/adb'), path.join(dir, 'bin/maestro')]);

		const counter = path.join(dir, 'retry-count');
		const result = runShell(retry, {
			env: {
				HOME: dir,
				PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
				MAESTRO_RETRY_COUNTER: counter,
				DEVICE_CLASS: 'phone',
			},
		});

		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.equal(readFileSync(path.join(dir, '.maestro/tests/exit_code'), 'utf8'), '0\n');
		assert.throws(() => readFileSync(counter, 'utf8'), { code: 'ENOENT' });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
