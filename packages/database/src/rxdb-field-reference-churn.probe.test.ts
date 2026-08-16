/**
 * PROBE — not a product test.
 *
 * The engine adapter dedupes its `field$` observables with a bare `distinctUntilChanged()`
 * (reference equality). RxDB's own `get$` uses `distinctUntilChanged(deepEqual)` and says
 * why:
 *
 *   "Use deepEqual for non-primitive values (objects/arrays) because the default ===
 *    comparison always fails across document revisions since each revision creates new
 *    object references."
 *
 * That claim is the entire justification for changing our adapter, so it is verified here
 * against a REAL RxDB database rather than a hand-made fake: after a write that touches only
 * field A, does unchanged field B come back as a new object reference?
 */
import { createRxDatabase, type RxDocument } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { deepEqual } from 'rxdb/plugins/utils';
import { firstValueFrom, skip } from 'rxjs';

type Row = {
	id: string;
	counter: number;
	billing: { country: string; city: string };
	lines: { sku: string; qty: number }[];
};

const schema = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 32 },
		counter: { type: 'number' },
		billing: {
			type: 'object',
			properties: { country: { type: 'string' }, city: { type: 'string' } },
		},
		lines: {
			type: 'array',
			items: {
				type: 'object',
				properties: { sku: { type: 'string' }, qty: { type: 'number' } },
			},
		},
	},
	required: ['id', 'counter'],
};

let probeCounter = 0;

async function makeCollection() {
	const db = await createRxDatabase({
		name: `refprobe${probeCounter++}`,
		storage: getRxStorageMemory(),
	});
	const { rows } = await db.addCollections({ rows: { schema: schema as never } });
	await rows.insert({
		id: 'a',
		counter: 0,
		billing: { country: 'US', city: 'Portland' },
		lines: [{ sku: 'X', qty: 1 }],
	});
	return { db, rows };
}

describe('RxDB nested field reference identity across revisions', () => {
	it('gives a NEW object reference for an unchanged nested field after an unrelated write', async () => {
		const { db, rows } = await makeCollection();
		const query = rows.find({ selector: {} });

		const before = (await firstValueFrom(query.$)) as RxDocument<Row>[];
		const billingBefore = before[0].billing;
		const linesBefore = before[0].lines;

		// Touch ONLY `counter`.
		const nextEmission = firstValueFrom(query.$.pipe(skip(1)));
		await rows
			.findOne('a')
			.exec()
			.then((doc) => doc!.incrementalPatch({ counter: 1 }));
		const after = (await nextEmission) as RxDocument<Row>[];

		const billingAfter = after[0].billing;
		const linesAfter = after[0].lines;

		// Content is identical...
		expect(deepEqual(billingBefore, billingAfter)).toBe(true);
		expect(deepEqual(linesBefore, linesAfter)).toBe(true);

		// ...but the references are not. THIS is the claim under test: a bare
		// distinctUntilChanged() would treat these as a change and re-emit.
		expect(billingAfter).not.toBe(billingBefore);
		expect(linesAfter).not.toBe(linesBefore);

		await db.close();
	});

	it('confirms RxDB own get$ suppresses the spurious emission that === would let through', async () => {
		const { db, rows } = await makeCollection();
		const doc = (await rows.findOne('a').exec()) as RxDocument<Row>;

		const seen: unknown[] = [];
		const sub = doc.get$('billing').subscribe((value) => seen.push(value));

		await doc.incrementalPatch({ counter: 1 });
		await doc.getLatest().incrementalPatch({ counter: 2 });

		sub.unsubscribe();

		// One emission: the initial value. The two unrelated writes are suppressed by deepEqual.
		expect(seen).toHaveLength(1);

		await db.close();
	});

	it('still emits from get$ when the nested field genuinely changes', async () => {
		const { db, rows } = await makeCollection();
		const doc = (await rows.findOne('a').exec()) as RxDocument<Row>;

		const seen: unknown[] = [];
		const sub = doc.get$('billing').subscribe((value) => seen.push(value));

		await doc.incrementalPatch({ billing: { country: 'GB', city: 'London' } });

		sub.unsubscribe();

		expect(seen).toHaveLength(2);
		expect(seen[1]).toEqual({ country: 'GB', city: 'London' });

		await db.close();
	});
});
