/**
 * Burn-down: the type ladder is `Text variant=…` (help, key, subheading, caption). Each
 * baselined file moves its literals to the variant and lowers its count; the baseline only
 * shrinks. Regenerate it after a migration, from the repo root:
 *   node --input-type=module -e "import { countByPath, scanRepository } from './packages/eslint/tests/text-ladder-scanner.mjs'; import { writeFileSync } from 'node:fs'; writeFileSync('packages/eslint/text-ladder-allowlist.json', JSON.stringify(countByPath(scanRepository()), null, '\t') + '\n');"
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { prContext, readBlob, readEvent } from '../../../scripts/check-test-removal.mjs';
import { CONSTRUCT, countByPath, scanRepository, scanSource } from './text-ladder-scanner.mjs';
import { ratchetErrors, ROOT } from './uniwind-scanner.mjs';

const FILE = 'packages/eslint/text-ladder-allowlist.json';
const nested = (counts) =>
	Object.fromEntries(Object.entries(counts).map(([path, count]) => [path, { [CONSTRUCT]: count }]));
const allowlist = JSON.parse(readFileSync(`${ROOT}/${FILE}`, 'utf8'));
// Reuse the Lint job's immutable PR base; local edits compare with HEAD. No fetch.
const base = readEvent(prContext()?.eventPath)?.pull_request?.base?.sha ?? 'HEAD';
const prior = readBlob(base, FILE, ROOT);
// Bootstrap only: today's literals must already exist in the base source.
const baseline = prior
	? JSON.parse(prior)
	: countByPath(
			Object.keys(allowlist).flatMap((path) => scanSource(readBlob(base, path, ROOT), path))
		);
const path = 'packages/core/src/screens/main/new-file.tsx';

test('ladder literals on Text match the shrinking baseline exactly', () => {
	assert.deepEqual(ratchetErrors(scanRepository(), nested(allowlist), nested(baseline)), []);
});

test('each ladder combo on a Text is one site; a variant is none', () => {
	for (const classes of [
		'text-muted-foreground text-xs',
		'text-sm text-muted-foreground',
		'flex-1 text-sm font-medium',
		'text-base font-medium',
		'text-xs font-semibold tracking-wide uppercase',
	])
		assert.deepEqual(scanSource(`<Text className="${classes}" />`, path), [
			`${path}:1:1:${CONSTRUCT}`,
		]);
	assert.deepEqual(scanSource('<Text variant="help" className="flex-1" />', path), []);
});

test('follows cn() branches and local constants; ignores other elements and lone classes', () => {
	const source = `
		const LABEL = 'text-muted-foreground mb-1 text-xs';
		<Text className={LABEL} />;
		<Text className={cn('text-sm', active && 'font-medium')} />;
		<View className="text-muted-foreground text-xs" />;
		<Text className="text-muted-foreground" />;
	`;
	assert.deepEqual(scanSource(source, path), [
		`${path}:3:1:${CONSTRUCT}`,
		`${path}:4:1:${CONSTRUCT}`,
	]);
});

test('a new site in a baselined file fails, and so does a grown baseline', () => {
	const live = scanSource('<Text className="text-muted-foreground text-xs" />', path);
	assert.match(ratchetErrors(live, {})[0], /New violation/);
	assert.match(ratchetErrors(live, nested({ [path]: 1 }), {})[0], /Allowlist grew/);
});
