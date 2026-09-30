#!/usr/bin/env node
/**
 * Fail, naming them, on `e2e/quarantine.json` entries (#2284) that match no collected test,
 * so a renamed spec cannot rot the list silently; print per-group counts.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
// Listing touches no store, but the config builds the free projects only when one is named.
const DUMMY_STORE = 'https://quarantine-check.invalid';
const key = (project, file, title) => [project, file, title].join('\u0000');

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
const walk = (suite, file, describes) => {
	for (const spec of suite.specs ?? []) {
		const title = [...describes, spec.title].join(' › ');
		for (const test of spec.tests) collected.add(key(test.projectName, file, title));
	}
	for (const child of suite.suites ?? []) walk(child, file, [...describes, child.title]);
};
// Top-level suites are files; their titles are paths, not part of an entry's title.
for (const fileSuite of JSON.parse(result.stdout.slice(start)).suites) {
	walk(fileSuite, basename(fileSuite.file), []);
}

const { entries } = JSON.parse(readFileSync(join(APP_DIR, 'e2e', 'quarantine.json'), 'utf8'));
const perGroup = {};
for (const e of entries) perGroup[e.group] = (perGroup[e.group] ?? 0) + 1;
console.log(`${entries.length} quarantine entries, ${collected.size} collected tests`);
for (const group of Object.keys(perGroup).sort()) console.log(`  ${group}: ${perGroup[group]}`);

const stale = entries.filter((e) => !collected.has(key(e.project, e.file, e.title)));
if (stale.length > 0) {
	console.error(`\n${stale.length} entries match no collected test:`);
	for (const e of stale) console.error(`  [${e.group}] ${e.project} ${e.file} › ${e.title}`);
	process.exit(1);
}
console.log('every entry matches a collected test');
