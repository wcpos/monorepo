/**
 * PROBE — not a product test.
 *
 * Answers one question that the document-identity work (audit findings #1/#2/#3) rests on:
 *
 *   When a query re-emits because ONE document changed, does RxDB hand back the SAME
 *   RxDocument instance for the documents that did NOT change?
 *
 * If yes, `wrapEngineDocument()` can cache its Proxy in a WeakMap keyed on the underlying
 * RxDocument and preserve wrapper identity for free. If no, the cache needs a
 * primary-key + revision key, and any WeakMap approach is dead on arrival.
 *
 * Kept in the repo because the answer is a load-bearing assumption about a third-party
 * library, and it should re-run when RxDB is upgraded.
 */
import { createRxDatabase, type RxDocument } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { firstValueFrom, skip } from 'rxjs';

type Row = { id: string; name: string; counter: number };

const schema = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 32 },
		name: { type: 'string' },
		counter: { type: 'number' },
	},
	required: ['id', 'name', 'counter'],
} as const;

let probeCounter = 0;

async function makeCollection() {
	const db = await createRxDatabase({
		name: `probe${probeCounter++}`,
		storage: getRxStorageMemory(),
	});
	const { rows } = await db.addCollections({ rows: { schema: schema as never } });
	await rows.bulkInsert([
		{ id: 'a', name: 'Alpha', counter: 0 },
		{ id: 'b', name: 'Bravo', counter: 0 },
		{ id: 'c', name: 'Charlie', counter: 0 },
	]);
	return { db, rows };
}

describe('RxDB document instance identity across query emissions', () => {
	it('reuses the RxDocument instance for documents that did not change', async () => {
		const { db, rows } = await makeCollection();
		const query = rows.find({ selector: {}, sort: [{ id: 'asc' }] });

		const first = (await firstValueFrom(query.$)) as RxDocument<Row>[];
		expect(first.map((doc) => doc.id)).toEqual(['a', 'b', 'c']);

		const byIdBefore = new Map(first.map((doc) => [doc.id, doc]));

		// Change exactly one document, and wait for the query's NEXT emission.
		const nextEmission = firstValueFrom(query.$.pipe(skip(1)));
		await rows
			.findOne('b')
			.exec()
			.then((doc) => doc!.incrementalPatch({ counter: 1 }));
		const second = (await nextEmission) as RxDocument<Row>[];

		const byIdAfter = new Map(second.map((doc) => [doc.id, doc]));

		// The changed document must be a new instance carrying the new value.
		expect(byIdAfter.get('b')).not.toBe(byIdBefore.get('b'));
		expect(byIdAfter.get('b')!.counter).toBe(1);

		// THE QUESTION: are the untouched ones the same object?
		expect(byIdAfter.get('a')).toBe(byIdBefore.get('a'));
		expect(byIdAfter.get('c')).toBe(byIdBefore.get('c'));

		await db.close();
	});

	it('reuses instances across two independent queries over the same documents', async () => {
		const { db, rows } = await makeCollection();

		const fromFind = (await firstValueFrom(
			rows.find({ selector: {}, sort: [{ id: 'asc' }] }).$
		)) as RxDocument<Row>[];
		const fromFindOne = (await rows.findOne('a').exec()) as RxDocument<Row>;

		expect(fromFindOne).toBe(fromFind.find((doc) => doc.id === 'a'));

		await db.close();
	});

	/**
	 * THE load-bearing test. An RxDocument instance is immutable: `_data` is assigned once in
	 * the constructor (`rx-document.ts:455`) and every read goes through it, so a given
	 * instance's data can never change underneath a cached wrapper.
	 *
	 * This is the property the wrapper cache's safety rests on — stronger and simpler than
	 * "RxDB reuses instances for unchanged documents", which only explains why the cache
	 * HITS. Under immutability a cached wrapper is exactly as current as the document it
	 * wraps, which is unchanged behaviour, and no enumeration of the paths that produce
	 * documents is required.
	 */
	it('never mutates an existing instance — a write produces a separate one', async () => {
		const { db, rows } = await makeCollection();

		const stale = (await rows.findOne('a').exec()) as RxDocument<Row>;
		expect(stale.counter).toBe(0);

		await stale.incrementalPatch({ counter: 5 });

		// The captured instance still reads its ORIGINAL value. If RxDB mutated `_data` in
		// place this would be 5, and caching a wrapper against an instance would be unsafe.
		expect(stale.counter).toBe(0);

		// The new state is a DIFFERENT object, reached explicitly.
		const latest = stale.getLatest();
		expect(latest).not.toBe(stale);
		expect(latest.counter).toBe(5);

		await db.close();
	});
});
