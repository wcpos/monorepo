import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { StoreDatabase } from '@wcpos/database';

import {
	failCompletionAttempt,
	pendingCompletions,
	recordCompletionAttempt,
	resolveCompletionAttempt,
} from './completion-journal';

addRxPlugin(RxDBLocalDocumentsPlugin);
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
		await failCompletionAttempt(db, 'order', new Error('finish failed'), {
			missingStart: true,
			unpaidStart: true,
		});
		expect((await pendingCompletions(db)).order).toMatchObject({
			attempts: 1,
			missingStarts: 1,
			unpaidStarts: 1,
			lastError: 'finish failed',
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
			attempts: 0,
		});
	} finally {
		timestamp.mockRestore();
	}
});
it('failure increments attempts and keeps the recorded facts', async () => {
	await recordCompletionAttempt(db, attempt);
	const first = (await pendingCompletions(db)).order;
	await failCompletionAttempt(db, 'order', new Error('finish failed'));
	await failCompletionAttempt(db, 'order', 'again');
	expect((await pendingCompletions(db)).order).toEqual({
		...first,
		attempts: 2,
		lastError: 'again',
	});
});
it('resolves only the named order and never resurrects it on late failure', async () => {
	await recordCompletionAttempt(db, attempt);
	await recordCompletionAttempt(db, { ...attempt, orderUuid: 'other' });
	await resolveCompletionAttempt(db, 'order');
	await failCompletionAttempt(db, 'order', 'late');
	expect(Object.keys(await pendingCompletions(db))).toEqual(['other']);
});
it('resolve with a stale expectAt leaves the replacement attempt untouched', async () => {
	await recordCompletionAttempt(db, attempt);
	const pending = await pendingCompletions(db);
	await resolveCompletionAttempt(db, 'order', 'stale-at');
	expect(await pendingCompletions(db)).toEqual(pending);
	await resolveCompletionAttempt(db, 'order', pending.order.at);
	expect(await pendingCompletions(db)).toEqual({});
});
it('fail with a stale expectAt bumps nothing on the replacement attempt', async () => {
	await recordCompletionAttempt(db, attempt);
	const pending = await pendingCompletions(db);
	const options = { missingStart: true, unpaidStart: true };
	await failCompletionAttempt(db, 'order', 'stale failure', { ...options, expectAt: 'stale-at' });
	expect(await pendingCompletions(db)).toEqual(pending);
	await failCompletionAttempt(db, 'order', 'current failure', {
		...options,
		expectAt: pending.order.at,
	});
	expect((await pendingCompletions(db)).order).toEqual({
		...pending.order,
		attempts: 1,
		missingStarts: 1,
		unpaidStarts: 1,
		lastError: 'current failure',
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
	expect(remaining.third).toMatchObject({ source: 'manual', attempts: 0 });
	// Either serialization of a record/delete pair is valid; neither may lose another order.
	expect(Object.keys(remaining).filter((uuid) => uuid !== 'third')).toEqual(
		remaining.other ? ['other'] : []
	);
	if (remaining.other) expect(remaining.other).toMatchObject({ source: 'manual', attempts: 0 });
});
