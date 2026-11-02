/**
 * Burn-down: every translation key is a literal `t('…')` call, because the string extractor
 * (`scripts/extract-js-strings.js`) reads no other form and a computed key drops out of the
 * catalog sent to translators. Each baselined file moves its keys into a table or switch of
 * literal calls and lowers its count; the baseline only shrinks. Regenerate it, from the repo root:
 *   node --input-type=module -e "import { countByPath } from './packages/eslint/tests/text-ladder-scanner.mjs'; import { scanRepository } from './packages/eslint/tests/i18n-literal-scanner.mjs'; import { writeFileSync } from 'node:fs'; writeFileSync('packages/eslint/tests/i18n-literal-allowlist.json', JSON.stringify(countByPath(scanRepository()), null, '\t') + '\n');"
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { prContext, readBlob, readEvent } from '../../../scripts/check-test-removal.mjs';
import { CONSTRUCT, scanRepository, scanSource } from './i18n-literal-scanner.mjs';
import { countByPath } from './text-ladder-scanner.mjs';
import { ratchetErrors, ROOT } from './uniwind-scanner.mjs';

const FILE = 'packages/eslint/tests/i18n-literal-allowlist.json';
const nested = (counts) =>
	Object.fromEntries(Object.entries(counts).map(([path, count]) => [path, { [CONSTRUCT]: count }]));
const allowlist = JSON.parse(readFileSync(`${ROOT}/${FILE}`, 'utf8'));
// Reuse the Lint job's immutable PR base; local edits compare with HEAD. No fetch.
const base = readEvent(prContext()?.eventPath)?.pull_request?.base?.sha ?? 'HEAD';
const prior = readBlob(base, FILE, ROOT);
// Bootstrap only: today's sites must already exist in the base source.
const baseline = prior
	? JSON.parse(prior)
	: countByPath(
			Object.keys(allowlist).flatMap((path) => scanSource(readBlob(base, path, ROOT), path))
		);
const path = 'packages/core/src/screens/main/new-file.tsx';

test('computed translation keys match the shrinking baseline exactly', () => {
	assert.deepEqual(ratchetErrors(scanRepository(), nested(allowlist), nested(baseline)), []);
});

test('a template, a variable or a ternary key is a site; a literal is none', () => {
	for (const call of [
		't(`settings.setup_${key}`)',
		't(key)',
		't(LABELS[kind], { n })',
		"t(open ? 'reports.open' : 'register.closed')",
		'ctx.t(reasonKey, params)',
	])
		assert.deepEqual(scanSource(`const label = ${call};`, path), [`${path}:1:1:${CONSTRUCT}`]);
	for (const call of [
		"t('settings.setup_ok')",
		't("common.yes", { n })',
		't(`common.no`)',
		"open ? t('reports.open') : t('register.closed')",
		"t(\n\t'common.retry'\n)",
		'format(key)',
	])
		assert.deepEqual(scanSource(`const label = ${call};`, path), []);
});

test('a catalog key passed to any function but t is a site', () => {
	assert.deepEqual(scanSource("const a = translate('common.save');", path), [
		`${path}:1:1:${CONSTRUCT}`,
	]);
	assert.deepEqual(scanSource("const a = logger.info('common.not_a_key_here');", path), []);
});

test('a .ts file parses as TS, so a cast does not hide the site after it', () => {
	const ts = 'packages/core/src/screens/main/new-file.ts';
	assert.deepEqual(scanSource('const a = <string>b;\nconst c = t(key);', ts), [
		`${ts}:2:1:${CONSTRUCT}`,
	]);
});

test('a new site in any file fails, and so does a grown baseline', () => {
	const live = scanSource('const label = t(`common.${value}`);', path);
	assert.match(ratchetErrors(live, {})[0], /New violation/);
	assert.match(ratchetErrors(live, nested({ [path]: 1 }), {})[0], /Allowlist grew/);
});
