import assert from 'node:assert/strict';
import test from 'node:test';

import { expectCartAddMeasurement } from '../apps/main/e2e/cart-add-timing.ts';

const sample = { status: 'complete', durationMs: 301 };
const pageClosed = new Error('Target page has been closed');

function sequencedPage(...results) {
	let calls = 0;
	return {
		get calls() {
			return calls;
		},
		evaluate: async () => {
			const result = results[calls++];
			if (result instanceof Error) throw result;
			return result;
		},
	};
}

function testInfo(attachments) {
	return {
		attach: async (name, options) => attachments.push({ name, ...options }),
		project: { name: 'chromium' },
	};
}

test('page loss during sample cleanup preserves the timing assertion and diagnostic', async () => {
	const page = sequencedPage(sample, sample, pageClosed, pageClosed);
	const attachments = [];

	await assert.rejects(expectCartAddMeasurement(page, testInfo(attachments), 300), /Expected: <= 300/);

	assert.deepEqual(JSON.parse(attachments[0].body).rawSamples, [sample]);
	assert.equal(page.calls, 4);
});

test('page loss while stopping cannot fail a successful timing assertion', async () => {
	const accepted = { ...sample, durationMs: 300 };
	const page = sequencedPage(accepted, accepted, accepted, pageClosed);
	const attachments = [];

	await expectCartAddMeasurement(page, testInfo(attachments), 300);

	assert.equal(attachments.length, 1);
	assert.equal(page.calls, 4);
});
