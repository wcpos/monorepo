#!/usr/bin/env node
/**
 * Fail, naming them, on `e2e/quarantine.json` entries (#2284) that match no collected test,
 * so a renamed spec cannot rot the list silently; print per-group counts.
 *
 * `--report <playwright json report>` instead prints each entry's outcome in that run and
 * exits 1, naming them, if any listed test passed (its entry should be removed); 2 on a bad report.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
// Listing touches no store, but the config builds the free projects only when one is named.
const DUMMY_STORE = 'https://quarantine-check.invalid';
const key = (project, file, title) => [project, file, title].join('\u0000');
const describe = (e) => `[${e.group}] ${e.project} ${e.file} › ${e.title}`;

// Top-level suites are files; their titles are paths relative to testDir (the gate's
// titlePath[0]), not part of an entry's title.
const eachTest = (report, visit) => {
	const walk = (suite, file, describes) => {
		for (const spec of suite.specs ?? []) {
			const title = [...describes, spec.title].join(' › ');
			for (const test of spec.tests) visit(key(test.projectName, file, title), test);
		}
		for (const child of suite.suites ?? []) walk(child, file, [...describes, child.title]);
	};
	for (const fileSuite of report.suites) walk(fileSuite, fileSuite.file, []);
};

const { entries } = JSON.parse(readFileSync(join(APP_DIR, 'e2e', 'quarantine.json'), 'utf8'));

if (process.argv[2] === '--report') {
	// A missing or malformed report throws (exit 2), so exit 1 always means "some passed".
	process.on('uncaughtException', (error) => (console.error(error), process.exit(2)));
	const report = JSON.parse(readFileSync(process.argv[3], 'utf8'));
	const OUTCOME = { expected: 'passed', unexpected: 'failed', flaky: 'flaky' };
	const outcomes = new Map();
	eachTest(report, (k, test) => outcomes.set(k, OUTCOME[test.status] ?? 'not run'));
	const outcomeOf = (e) => outcomes.get(key(e.project, e.file, e.title)) ?? 'not run';
	for (const e of entries) console.log(`  ${outcomeOf(e).padEnd(7)} ${describe(e)}`);
	const passed = entries.filter((e) => outcomeOf(e) === 'passed');
	if (passed.length > 0) {
		console.error(`\n${passed.length} quarantined tests passed; remove their entries:`);
		for (const e of passed) console.error(`  ${describe(e)}`);
		process.exit(1);
	}
	console.log('no quarantined test passed');
	process.exit(0);
}

const result = spawnSync('npx', ['playwright', 'test', '--list', '--reporter=json'], {
	cwd: APP_DIR,
	env: { ...process.env, E2E_STORE_URL_PRO: DUMMY_STORE, E2E_STORE_URL_FREE: DUMMY_STORE },
	encoding: 'utf8',
	maxBuffer: 256 * 1024 * 1024,
});
const start = result.stdout.search(/^\{/m);
if (result.status !== 0 || start < 0) {
	console.error(result.stderr || result.stdout);
	throw new Error(`playwright --list failed (exit ${result.status})`);
}
const collected = new Set();
eachTest(JSON.parse(result.stdout.slice(start)), (k) => collected.add(k));

const perGroup = {};
for (const e of entries) perGroup[e.group] = (perGroup[e.group] ?? 0) + 1;
console.log(`${entries.length} quarantine entries, ${collected.size} collected tests`);
for (const group of Object.keys(perGroup).sort()) console.log(`  ${group}: ${perGroup[group]}`);

const stale = entries.filter((e) => !collected.has(key(e.project, e.file, e.title)));
if (stale.length > 0) {
	console.error(`\n${stale.length} entries match no collected test:`);
	for (const e of stale) console.error(`  ${describe(e)}`);
	process.exit(1);
}
console.log('every entry matches a collected test');
