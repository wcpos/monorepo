#!/usr/bin/env node
/**
 * Test-deletion tripwire (ruling R15, 2026-08-06).
 *
 * A bot commit deleted the only payment-completing E2E assertion and nothing in
 * CI noticed: a green suite that no longer tests the thing reads exactly like a
 * green suite that does. This check makes losing tests a decision somebody has
 * to write down, not a side effect of a diff nobody read.
 *
 * In a pull-request context it fails when either happens between the base and
 * the PR head:
 *   1. a `*.test.*` / `*.spec.*` file is DELETED, or
 *   2. a surviving test file's declaration count (`it(` / `test(`, modifiers
 *      included) drops by more than COUNT_DROP_THRESHOLD.
 *
 * Renames and moves are found with `--find-renames`, so shuffling a suite
 * between directories is invisible here — only the count matters.
 *
 * WHAT THIS DOES NOT CATCH, deliberately: a test rewritten in place to assert
 * less. The commit that motivated the ruling (7a556ce86) kept the file, kept
 * the count, renamed the test and deleted its assertions. No count threshold
 * sees that; only review does. This tripwire closes the two mechanical holes
 * and leaves the judgment hole where it belongs.
 *
 * Acknowledging is intentionally cheap and intentionally on the record — see
 * ACK_LABEL / ACK_PATTERN and the failure message below.
 *
 * Outside a PR (local runs, pushes to a trunk) it exits 0 without touching git.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** `foo.test.ts`, `foo.spec.tsx`, `foo.test.mjs` — the whole `*.test.*` / `*.spec.*` family. */
export const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/**
 * A drop of MORE than this many declarations in one surviving file trips.
 * Measured, not guessed. Replayed over the 250 first-parent commits before this
 * one, count-drop alone fires on:
 *     >0: 9 commits    >1: 6    >2: 4    >3: 3    >4: 3    >5: 3
 * 3 is the knee. Below it the extra hits are ordinary consolidation (a −3 on
 * query/tests/requirement-bridge.test.ts merging duplicate cases, a −2 on a
 * seeder test); above it nothing more is bought. The 3 that survive at −3 are
 * all real: −35 when the POS money tests moved to packages/order-math (#584),
 * −25 when the fetcher was extracted from create-app-engine, −7 on the query
 * grammar cutover.
 *
 * Note what that last class is: a file SPLIT, where the other half landed in a
 * new file. `--find-renames` cannot see a split, so these are the expected
 * false positives — roughly 1 commit in 80 — and the acknowledgement line is
 * how they clear. Adding deletions, the whole gate fires on 14/250 commits.
 */
export const COUNT_DROP_THRESHOLD = 3;

/** Label on the PR. */
export const ACK_LABEL = 'test-removal-approved';
/**
 * `Test-Removal: <why>` in the PR body or in any commit message in the range.
 * The commit-message route is the reliable one: the PR-event payload this
 * script reads is captured when the run starts, so a label added afterwards
 * only takes effect on the next push.
 */
export const ACK_PATTERN = /^[ \t]*Test-Removal:[ \t]*\S.*$/m;

/**
 * Modifiers that still produce a test. `describe`, `beforeEach`, `use`, `step`
 * and `setTimeout` are deliberately absent: Playwright specs are dense with
 * `test.describe(` / `test.beforeEach(`, and counting those would make the
 * number track file structure instead of test coverage.
 */
const TEST_MODIFIER = '(?:only|skip|todo|failing|fails|concurrent|sequential|each|runIf|skipIf)';
/**
 * `it(`, `test(`, `it.each([…])(`, `test.skip(`, `` it.each`table` `` — but never
 * `foo.test(` (a regex `.test()` call) or `test.describe(`.
 */
const TEST_DECLARATION = new RegExp(
	`(?<![.\\w$])(?:it|test)(?:\\s*\\.\\s*${TEST_MODIFIER})*\\s*(?:\\(|\`)`,
	'g'
);

/** How many tests a source file declares. */
export function countTestDeclarations(source) {
	return source.match(TEST_DECLARATION)?.length ?? 0;
}

/**
 * `git diff --name-status -z` records. NUL-delimited because paths are not
 * required to be printable: a rename is `R096\0old\0new\0`, everything else is
 * `<status>\0path\0`.
 */
export function parseNameStatusZ(stdout) {
	const fields = stdout.split('\0').filter((field) => field !== '');
	const changes = [];
	for (let index = 0; index < fields.length;) {
		const status = fields[index];
		const code = status[0];
		if (code === 'R' || code === 'C') {
			changes.push({
				status: code,
				oldPath: fields[index + 1],
				path: fields[index + 2],
			});
			index += 3;
		} else {
			changes.push({
				status: code,
				oldPath: fields[index + 1],
				path: fields[index + 1],
			});
			index += 2;
		}
	}
	return changes;
}

const git = (args, cwd = repoRoot) =>
	execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	});

/** A blob's text, or '' when the path does not exist at that revision. */
export function readBlob(revision, filePath, cwd) {
	try {
		return git(['show', `${revision}:${filePath}`], cwd);
	} catch (error) {
		const stderr = String(error?.stderr ?? '');
		if (/^fatal: path .* (?:does not exist in|exists on disk, but not in) /m.test(stderr)) {
			return '';
		}
		throw new Error(
			`check-test-removal: cannot read ${revision}:${filePath} — ${stderr.trim() || error.message}`
		);
	}
}

/**
 * Deleted test files and surviving test files whose declaration count fell too
 * far. `readSource(revision, path)` is injected so the unit tests can drive the
 * logic off fixtures instead of a repository.
 */
export function findRemovals(changes, readSource, threshold = COUNT_DROP_THRESHOLD) {
	const deleted = [];
	const shrunk = [];
	for (const change of changes) {
		if (change.status === 'D') {
			if (!TEST_FILE.test(change.oldPath)) continue;
			const before = countTestDeclarations(readSource('base', change.oldPath));
			deleted.push({ path: change.oldPath, count: before });
			continue;
		}
		if (change.status === 'A') continue;
		// A rename out of the test-file family is a deletion wearing a disguise:
		// `pos-checkout.spec.ts` -> `pos-checkout.ts` stops running entirely.
		if (!TEST_FILE.test(change.path)) {
			if (!TEST_FILE.test(change.oldPath)) continue;
			const before = countTestDeclarations(readSource('base', change.oldPath));
			deleted.push({
				path: `${change.oldPath} -> ${change.path}`,
				count: before,
			});
			continue;
		}
		if (!TEST_FILE.test(change.oldPath)) continue;
		const before = countTestDeclarations(readSource('base', change.oldPath));
		const after = countTestDeclarations(readSource('head', change.path));
		const delta = after - before;
		if (delta < -threshold) {
			shrunk.push({
				path: change.path,
				oldPath: change.oldPath,
				before,
				after,
				delta,
			});
		}
	}
	return { deleted, shrunk };
}

/**
 * The acknowledgement, if the PR carries one. `event` is the parsed
 * `$GITHUB_EVENT_PATH` payload (no API call — the Lint job has no token beyond
 * `contents: read`), `commitMessages` the messages in the diff range.
 */
export function findAcknowledgement(event, commitMessages = []) {
	const labels = event?.pull_request?.labels ?? [];
	if (labels.some((label) => label?.name === ACK_LABEL)) {
		return { source: `label \`${ACK_LABEL}\`` };
	}
	const body = event?.pull_request?.body ?? '';
	const inBody = ACK_PATTERN.exec(body);
	if (inBody) return { source: 'PR body', line: inBody[0].trim() };
	for (const message of commitMessages) {
		const inCommit = ACK_PATTERN.exec(message);
		if (inCommit) return { source: 'commit message', line: inCommit[0].trim() };
	}
	return null;
}

export function formatFailure({ deleted, shrunk }, threshold = COUNT_DROP_THRESHOLD) {
	const lines = [];
	if (deleted.length > 0) {
		lines.push(`${deleted.length} test file(s) removed:`);
		for (const entry of deleted) {
			lines.push(`  ${entry.path}  (${entry.count} test${entry.count === 1 ? '' : 's'})`);
		}
	}
	if (shrunk.length > 0) {
		lines.push(`${shrunk.length} test file(s) lost more than ${threshold} tests:`);
		for (const entry of shrunk) {
			const moved = entry.oldPath === entry.path ? '' : `  (was ${entry.oldPath})`;
			lines.push(`  ${entry.path}  ${entry.before} -> ${entry.after} (${entry.delta})${moved}`);
		}
	}
	const total =
		deleted.reduce((sum, entry) => sum + entry.count, 0) +
		shrunk.reduce((sum, entry) => sum - entry.delta, 0);
	return [
		`This PR removes ${total} test${total === 1 ? '' : 's'} (ruling R15).`,
		'',
		...lines,
		'',
		'If that is deliberate, say so on the record — any ONE of:',
		`  • add a \`Test-Removal: <why>\` line to a commit message in this PR (most reliable —`,
		'    the label and body are read from the event payload captured when the run started,',
		'    so adding them clears the check only on the next push)',
		'  • add a `Test-Removal: <why>` line to the PR description, then push',
		`  • add the \`${ACK_LABEL}\` label, then push`,
		'',
		'If it is NOT deliberate, restore the tests. Renames and moves do not trip this;',
		'only deletions and net losses of test declarations do.',
	].join('\n');
}

/** The PR this run belongs to, or null when there is no PR — pushes, local runs. */
export function prContext(env = process.env) {
	const eventName = env.GITHUB_EVENT_NAME;
	if (eventName !== 'pull_request' && eventName !== 'pull_request_target') return null;
	if (!env.GITHUB_BASE_REF) return null;
	return { baseRef: env.GITHUB_BASE_REF, eventPath: env.GITHUB_EVENT_PATH };
}

/**
 * The base commit to diff against. The event's immutable base SHA is preferred;
 * the first parent of GitHub's PR merge commit is the fallback.
 */
export function resolveBase(baseRevision, cwd = repoRoot) {
	for (const candidate of [baseRevision, 'HEAD^1']) {
		if (!candidate) continue;
		try {
			return git(['rev-parse', '--verify', `${candidate}^{commit}`], cwd).trim();
		} catch {
			/* try the next candidate */
		}
	}
	return null;
}

export function readEvent(eventPath) {
	if (!eventPath) return null;
	try {
		return JSON.parse(readFileSync(eventPath, 'utf8'));
	} catch {
		return null;
	}
}

export function checkTestRemoval({ env = process.env, cwd = repoRoot, baseOverride } = {}) {
	const context = baseOverride ? { baseRef: baseOverride } : prContext(env);
	if (!context) {
		console.log('✓ check-test-removal: not a pull-request context, nothing to check');
		return;
	}
	const event = readEvent(context.eventPath);
	const baseRevision = baseOverride ?? event?.pull_request?.base?.sha;
	const base = resolveBase(baseRevision, cwd);
	if (!base) {
		throw new Error(
			'check-test-removal: cannot resolve the event base SHA or merge first parent. ' +
				'The Lint job must check out the PR history with `fetch-depth: 0`.'
		);
	}
	const changes = parseNameStatusZ(
		git(['diff', '--find-renames', '--name-status', '-z', `${base}...HEAD`], cwd)
	);
	const head = git(['rev-parse', 'HEAD'], cwd).trim();
	const readSource = (side, filePath) => readBlob(side === 'base' ? base : head, filePath, cwd);
	const removals = findRemovals(changes, readSource);
	if (removals.deleted.length === 0 && removals.shrunk.length === 0) {
		const testFiles = changes.filter(
			(change) => TEST_FILE.test(change.path) || TEST_FILE.test(change.oldPath)
		).length;
		console.log(`✓ check-test-removal: ${testFiles} test file(s) touched, none removed`);
		return;
	}
	const commitMessages = git(['log', '--format=%B%x00', `${base}..HEAD`], cwd)
		.split('\0')
		.filter((message) => message.trim() !== '');
	const acknowledgement = findAcknowledgement(event, commitMessages);
	if (acknowledgement) {
		console.log(
			`✓ check-test-removal: ${removals.deleted.length + removals.shrunk.length} file(s) lost tests, ` +
				`acknowledged via ${acknowledgement.source}${acknowledgement.line ? ` — ${acknowledgement.line}` : ''}`
		);
		return;
	}
	throw new Error(formatFailure(removals));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const flag = process.argv.indexOf('--base');
	try {
		checkTestRemoval({
			baseOverride: flag === -1 ? undefined : process.argv[flag + 1],
		});
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
