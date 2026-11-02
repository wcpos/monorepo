import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { StoreDatabase } from '@wcpos/database';

import {
	awaitAdoption,
	countCompletionStart,
	pendingCompletions,
	recordCompletionAttempt,
	resolveCompletionAttempt,
	retainCompletionAttempt,
} from '../../src/store-local';

addRxPlugin(RxDBLocalDocumentsPlugin);
addRxPlugin(RxDBMigrationSchemaPlugin);
let db: StoreDatabase;
beforeEach(async () => {
	db = await createRxDatabase({
		name: `journal${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	});
});
afterEach(async () => {
	await db.remove();
});
const attempt = { orderUuid: 'order', source: 'manual', paymentId: 'payment' } as const;
it('reads an empty journal without creating a document', async () => {
	expect(await pendingCompletions(db)).toEqual({});
	expect(await db.getLocal('sale-completions')).toBeNull();
});
it('a new attempt replaces the facts and counters', async () => {
	const timestamp = jest.spyOn(Date.prototype, 'toISOString');
	try {
		timestamp.mockReturnValue('2026-09-18T10:00:00.000Z');
		await recordCompletionAttempt(db, { ...attempt, actor: { id: 'a', name: 'Cashier A' } });
		const { at } = (await pendingCompletions(db)).order;
		await countCompletionStart(db, 'order', { at, start: 'missing' });
		await countCompletionStart(db, 'order', { at, start: 'unpaid' });
		expect((await pendingCompletions(db)).order).toMatchObject({
			missingStarts: 1,
			unpaidStarts: 1,
		});
		timestamp.mockReturnValue('2026-09-18T11:00:00.000Z');
		await recordCompletionAttempt(db, {
			orderUuid: 'order',
			source: 'terminal',
			paymentId: 'payment-b',
			actor: { id: 'b', name: 'Cashier B' },
		});
		expect((await pendingCompletions(db)).order).toEqual({
			source: 'terminal',
			paymentId: 'payment-b',
			actor: { id: 'b', name: 'Cashier B' },
			at: '2026-09-18T11:00:00.000Z',
		});
	} finally {
		timestamp.mockRestore();
	}
});
it('a retained failure keeps the recorded facts', async () => {
	await recordCompletionAttempt(db, attempt);
	const first = (await pendingCompletions(db)).order;
	await retainCompletionAttempt(db, 'order', { source: 'terminal' });
	await retainCompletionAttempt(db, 'order', { source: 'replay' });
	expect((await pendingCompletions(db)).order).toEqual(first);
});
it('resolves only the named order and never resurrects it on a late count or adoption', async () => {
	await recordCompletionAttempt(db, attempt);
	await recordCompletionAttempt(db, { ...attempt, orderUuid: 'other' });
	const { at } = (await pendingCompletions(db)).order;
	await resolveCompletionAttempt(db, 'order');
	await countCompletionStart(db, 'order', { at, start: 'missing' });
	await awaitAdoption(db, 'order');
	expect(Object.keys(await pendingCompletions(db))).toEqual(['other']);
});
it('a count with a stale at bumps nothing on the replacement attempt', async () => {
	await recordCompletionAttempt(db, attempt);
	const pending = await pendingCompletions(db);
	for (const start of ['missing', 'unpaid'] as const)
		expect(await countCompletionStart(db, 'order', { at: 'stale-at', start })).toBe('kept');
	expect(await pendingCompletions(db)).toEqual(pending);
	for (const start of ['missing', 'unpaid'] as const)
		await countCompletionStart(db, 'order', { at: pending.order.at, start });
	expect((await pendingCompletions(db)).order).toEqual({
		...pending.order,
		missingStarts: 1,
		unpaidStarts: 1,
	});
});
it('serializes concurrent record and resolve without losing unrelated entries', async () => {
	await recordCompletionAttempt(db, attempt);
	await Promise.all([
		recordCompletionAttempt(db, { ...attempt, orderUuid: 'other' }),
		resolveCompletionAttempt(db, 'order'),
		recordCompletionAttempt(db, { ...attempt, orderUuid: 'third' }),
	]);
	expect(Object.keys(await pendingCompletions(db)).sort()).toEqual(['other', 'third']);
	await Promise.all([
		recordCompletionAttempt(db, { ...attempt, orderUuid: 'other' }),
		resolveCompletionAttempt(db, 'other'),
	]);
	const remaining = await pendingCompletions(db);
	expect(remaining.third).toMatchObject({ source: 'manual' });
	// Either serialization of a record/delete pair is valid; neither may lose another order.
	expect(Object.keys(remaining).filter((uuid) => uuid !== 'third')).toEqual(
		remaining.other ? ['other'] : []
	);
	if (remaining.other) expect(remaining.other).toMatchObject({ source: 'manual' });
});

describe('the journal counts its own starts', () => {
	const current = async () => (await pendingCompletions(db)).order;
	const count = async (start: 'missing' | 'unpaid' | 'cancelled', at?: string) =>
		countCompletionStart(db, 'order', { at: at ?? (await current()).at, start });
	it.each<[string, () => Promise<void>]>([
		[
			'one missing start is kept and counted',
			async () => {
				await recordCompletionAttempt(db, attempt);
				expect(await count('missing')).toBe('kept');
				expect(await current()).toMatchObject({ missingStarts: 1 });
			},
		],
		[
			'the third missing start abandons the attempt in the same write',
			async () => {
				await recordCompletionAttempt(db, attempt);
				const { at } = await current();
				expect(await count('missing', at)).toBe('kept');
				expect(await count('missing', at)).toBe('kept');
				expect(await count('missing', at)).toBe('abandoned');
				expect(await pendingCompletions(db)).toEqual({});
			},
		],
		[
			'the kinds are counted apart: two unpaid and one missing is kept',
			async () => {
				await recordCompletionAttempt(db, attempt);
				expect(await count('unpaid')).toBe('kept');
				expect(await count('unpaid')).toBe('kept');
				expect(await count('missing')).toBe('kept');
				expect(await current()).toMatchObject({ unpaidStarts: 2, missingStarts: 1 });
			},
		],
		[
			'a cancelled start abandons the attempt at once',
			async () => {
				await recordCompletionAttempt(db, attempt);
				expect(await count('cancelled')).toBe('abandoned');
				expect(await pendingCompletions(db)).toEqual({});
			},
		],
		[
			'a cancelled start with a stale at is kept, untouched',
			async () => {
				await recordCompletionAttempt(db, attempt);
				const before = await pendingCompletions(db);
				expect(await count('cancelled', 'stale-at')).toBe('kept');
				expect(await pendingCompletions(db)).toEqual(before);
			},
		],
		[
			'a stale at is kept, untouched',
			async () => {
				await recordCompletionAttempt(db, attempt);
				const before = await pendingCompletions(db);
				expect(await count('missing', 'stale-at')).toBe('kept');
				expect(await count('unpaid', 'stale-at')).toBe('kept');
				expect(await pendingCompletions(db)).toEqual(before);
			},
		],
		[
			'no entry is kept, and no document is created',
			async () => {
				expect(await count('missing', 'any-at')).toBe('kept');
				expect(await db.getLocal('sale-completions')).toBeNull();
				await recordCompletionAttempt(db, { ...attempt, orderUuid: 'other' });
				expect(await count('unpaid', 'any-at')).toBe('kept');
				expect(Object.keys(await pendingCompletions(db))).toEqual(['other']);
			},
		],
		[
			'a re-record resets the counters',
			async () => {
				await recordCompletionAttempt(db, attempt);
				await count('missing');
				await count('missing');
				await recordCompletionAttempt(db, attempt);
				expect(await current()).not.toHaveProperty('missingStarts');
				expect(await count('missing')).toBe('kept');
				expect(await current()).toMatchObject({ missingStarts: 1 });
			},
		],
		[
			'awaitAdoption sets the flag and never creates',
			async () => {
				await awaitAdoption(db, 'order');
				expect(await db.getLocal('sale-completions')).toBeNull();
				await recordCompletionAttempt(db, attempt);
				const before = await current();
				await awaitAdoption(db, 'order');
				expect(await current()).toEqual({ ...before, awaitingAdoption: true });
			},
		],
		[
			'retainCompletionAttempt creates from facts, or keeps the existing entry',
			async () => {
				await retainCompletionAttempt(db, 'order', {
					source: 'terminal',
					actor: { id: 'a', name: 'Cashier A' },
				});
				expect(await current()).toEqual({
					source: 'terminal',
					actor: { id: 'a', name: 'Cashier A' },
					at: expect.any(String),
				});
				await recordCompletionAttempt(db, attempt);
				await count('unpaid');
				const kept = await current();
				await retainCompletionAttempt(db, 'order', { source: 'replay' });
				expect(await current()).toEqual(kept);
			},
		],
	])('%s', async (_name, scenario) => scenario());
});
