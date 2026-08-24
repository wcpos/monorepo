import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as errorCodeGenerator from './generate-error-codes.mjs';

const { generateErrorCodes, renderLocale, summaryKey } = errorCodeGenerator;

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const LOCALE_PATH = join(
	repoRoot,
	'packages/core/src/contexts/translations/locales/en/core.json'
);
const ARTIFACTS = [
	['error-codes.generated.ts', 'packages/utils/src/logger/generated/error-codes.generated.ts'],
	[
		'error-summaries.generated.ts',
		'packages/core/src/screens/main/logs/generated/error-summaries.generated.ts',
	],
	[
		'error-actions.generated.ts',
		'packages/core/src/screens/main/logs/generated/error-actions.generated.ts',
	],
];

/**
 * The drift guard. `extract-js-strings --check` catches a MISSING key; nothing
 * caught a stale VALUE, so editing a summary in the registry without running
 * the generator would leave every till rendering the old sentence — silently,
 * and in a file whose banner says not to edit it by hand.
 */
test('the committed artifacts are what the registry generates', async () => {
	const out = mkdtempSync(join(tmpdir(), 'wcpos-error-codes-'));
	await generateErrorCodes({
		registry: join(repoRoot, 'packages/utils/src/logger/error-registry.json'),
		outputDirectory: out,
		summariesDirectory: out,
		localeSource: LOCALE_PATH,
		localeOutput: join(out, 'core.json'),
	});

	for (const [generated, committed] of ARTIFACTS) {
		assert.equal(
			readFileSync(join(out, generated), 'utf8'),
			readFileSync(join(repoRoot, committed), 'utf8'),
			`${committed} is stale — run pnpm generate:error-codes`
		);
	}
	assert.equal(
		readFileSync(join(out, 'core.json'), 'utf8'),
		readFileSync(LOCALE_PATH, 'utf8'),
		'the English catalogue is stale — run pnpm generate:error-codes'
	);
	assert.equal(existsSync(join(out, 'error-docs')), false);
});

test('the retired generated-doc sync path stays absent', () => {
	const scripts = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts;

	assert.equal(scripts['sync:error-docs'], undefined);
	assert.equal(existsSync(join(repoRoot, 'scripts/sync-error-docs.mjs')), false);
	assert.equal(existsSync(join(repoRoot, 'scripts/splice-error-docs-sidebar.mjs')), false);
});

test('every code in the registry has a summary string in the English catalogue', () => {
	const registry = JSON.parse(
		readFileSync(join(repoRoot, 'packages/utils/src/logger/error-registry.json'), 'utf8')
	);
	const locale = JSON.parse(readFileSync(LOCALE_PATH, 'utf8'));

	for (const entry of registry) {
		assert.equal(locale[summaryKey(entry.code)], entry.summary, `summary for ${entry.code}`);
	}
});

test('every code in the registry has an action string in the English catalogue', () => {
	const registry = JSON.parse(
		readFileSync(join(repoRoot, 'packages/utils/src/logger/error-registry.json'), 'utf8')
	);
	const locale = JSON.parse(readFileSync(LOCALE_PATH, 'utf8'));

	for (const entry of registry) {
		assert.equal(typeof entry.actionHint, 'string', `actionHint for ${entry.code}`);
		assert.notEqual(entry.actionHint.trim(), '', `actionHint for ${entry.code}`);
		assert.equal(
			locale[`health.logs.error_action.${entry.code}`],
			entry.actionHint,
			`action for ${entry.code}`
		);
	}
});

test('actionKey returns the extractor-visible action locale key', () => {
	assert.equal(
		errorCodeGenerator.actionKey?.('SYNC101'),
		'health.logs.error_action.SYNC101'
	);
});

test('renderLocale leaves every other key untouched, value and position', () => {
	const source = {
		'a.first': 'first',
		'health.logs.error_summary.OLD999': 'a code that no longer exists',
		'm.middle': 'middle',
		'health.logs.error_action.OLD999': 'an action that no longer exists',
		'z.last': 'last',
	};

	const rendered = JSON.parse(
		renderLocale(
			[
				{
					code: 'SYNC101',
					summary: 'Something went wrong.',
					actionHint: 'Try again.',
				},
			],
			source
		)
	);

	assert.deepEqual(Object.keys(rendered), [
		'a.first',
		'health.logs.error_summary.SYNC101',
		'm.middle',
		'health.logs.error_action.SYNC101',
		'z.last',
	]);
	assert.equal(rendered['a.first'], 'first');
	assert.equal(rendered['m.middle'], 'middle');
	assert.equal(rendered['z.last'], 'last');
	// A code dropped from the registry loses its string rather than lingering as
	// a key translators keep paying for.
	assert.equal(rendered['health.logs.error_summary.OLD999'], undefined);
	assert.equal(rendered['health.logs.error_action.OLD999'], undefined);
});

test('renderLocale appends the block when the catalogue has none yet', () => {
	const rendered = JSON.parse(
		renderLocale(
			[
				{
					code: 'SYNC101',
					summary: 'Something went wrong.',
					actionHint: 'Try again.',
				},
			],
			{ 'a.first': 'first' }
		)
	);

	assert.deepEqual(Object.keys(rendered), [
		'a.first',
		'health.logs.error_summary.SYNC101',
		'health.logs.error_action.SYNC101',
	]);
});
