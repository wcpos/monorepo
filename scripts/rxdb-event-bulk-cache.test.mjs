// Pins patches/rxdb@17.6.0.patch: rxdb's module-level EVENT_BULK_CACHE in
// rx-change-event.js must be a WeakMap, not a Map. As a Map it keeps every
// change-event bulk that passes through `collection.$` / `db.$` alive forever,
// the linear heap slope of an idle sync-on soak (#2502). A WeakMap still
// shares one events array between subscribers of the same bulk. Both module
// formats are checked, since the patch must land in dist/esm and dist/cjs.
// If this fails after an rxdb bump, check whether upstream fixed
// EVENT_BULK_CACHE; port or drop the patch, never delete this test.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import v8 from 'node:v8';
import vm from 'node:vm';

import { rxChangeEventBulkToRxChangeEvents as esmToEvents } from 'rxdb';

const cjsToEvents = createRequire(import.meta.url)('rxdb').rxChangeEventBulkToRxChangeEvents;

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');

function makeBulk() {
	return {
		id: 'b1',
		collectionName: 'products',
		isLocal: false,
		events: [
			{
				documentId: 'p1',
				operation: 'INSERT',
				documentData: { id: 'p1', big: 'x'.repeat(1000) },
				previousDocumentData: undefined,
			},
		],
	};
}

function convertAndForget(toEvents) {
	const bulk = makeBulk();
	toEvents(bulk);
	return new WeakRef(bulk);
}

async function assertCacheSharesAndReleases(toEvents) {
	const bulk = makeBulk();
	const a = toEvents(bulk);
	const b = toEvents(bulk);
	assert.equal(a, b, 'two calls with the same bulk must share one events array');

	const ref = convertAndForget(toEvents);
	// deref() keeps its target alive until the current job ends, so it runs
	// after gc() and before the await, never in the same job as the next gc().
	for (let i = 0; i < 10; i++) {
		gc();
		if (ref.deref() === undefined) break;
		await new Promise((r) => setImmediate(r));
	}
	assert.equal(ref.deref(), undefined, 'EVENT_BULK_CACHE must not keep a converted bulk alive');
}

test('ESM rxdb: EVENT_BULK_CACHE shares per bulk and releases it', async () => {
	await assertCacheSharesAndReleases(esmToEvents);
});

test('CJS rxdb: EVENT_BULK_CACHE shares per bulk and releases it', async () => {
	await assertCacheSharesAndReleases(cjsToEvents);
});
