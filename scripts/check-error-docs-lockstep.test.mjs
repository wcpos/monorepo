import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parse } from 'yaml';

import { checkErrorDocsLockstep } from './check-error-docs-lockstep.mjs';

const codes = ['SYNC101', 'AUTH101'];

test('checks every registry code with a HEAD request', async () => {
	const requests = [];
	const status = await checkErrorDocsLockstep(codes, {
		fetchImpl: async (url, options) => {
			requests.push([url, options]);
			return { ok: true, status: 200 };
		},
	});

	assert.equal(status, 0);
	assert.deepEqual(
		requests.map(([url]) => url),
		[
			'https://raw.githubusercontent.com/wcpos/docs/main/versioned_docs/version-1.x/error-codes/SYNC101.mdx',
			'https://raw.githubusercontent.com/wcpos/docs/main/versioned_docs/version-1.x/error-codes/AUTH101.mdx',
		]
	);
	for (const [, options] of requests) {
		assert.equal(options.method, 'HEAD');
		assert.ok(options.signal instanceof AbortSignal, 'every request carries an abort deadline');
	}
});

test('a hung request times out into a warning, not a failure', async () => {
	const warnings = [];
	let wasAborted = false;
	const status = await checkErrorDocsLockstep(['SYNC101'], {
		timeoutMs: 5,
		fetchImpl: (url, { signal }) =>
			new Promise((resolve, reject) => {
				signal.addEventListener(
					'abort',
					() => {
						wasAborted = true;
						reject(signal.reason);
					},
					{ once: true }
				);
			}),
		warn: (message) => warnings.push(message),
	});

	assert.equal(status, 0);
	assert.equal(wasAborted, true);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /SYNC101/);
});

test('reports every missing page and exits one', async () => {
	const missing = [];
	const status = await checkErrorDocsLockstep(codes, {
		fetchImpl: async (url) => ({
			ok: !url.includes('SYNC101'),
			status: url.includes('SYNC101') ? 404 : 200,
		}),
		printMissing: (message) => missing.push(message),
	});

	assert.equal(status, 1);
	assert.deepEqual(missing, ['Missing error docs page: SYNC101']);
});

test('warns but exits zero for network errors other than 404', async () => {
	const warnings = [];
	let request = 0;
	const status = await checkErrorDocsLockstep(codes, {
		fetchImpl: async () => {
			request += 1;
			if (request === 1) throw new Error('offline');
			return { ok: false, status: 503 };
		},
		warn: (message) => warnings.push(message),
	});

	assert.equal(status, 0);
	assert.equal(warnings.length, 2);
	assert.match(warnings[0], /SYNC101.*offline/);
	assert.match(warnings[1], /AUTH101.*503/);
});

test('the lockstep workflow checkout does not persist credentials', () => {
	const workflow = parse(
		readFileSync(new URL('../.github/workflows/test.yml', import.meta.url), 'utf8')
	);
	const checkout = workflow.jobs['error-docs-lockstep'].steps.find(({ uses }) =>
		uses?.startsWith('actions/checkout@')
	);

	assert.ok(checkout, 'missing error-docs-lockstep checkout step');
	assert.equal(checkout.with?.['persist-credentials'], false);
});
