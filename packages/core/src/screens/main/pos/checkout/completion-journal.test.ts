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
it('records idempotently, preserving time, source, payment and failure history', async () => {
	await Promise.all([recordCompletionAttempt(db, attempt), recordCompletionAttempt(db, attempt)]);
	const first = (await pendingCompletions(db)).order;
	expect(first).toEqual({
		source: 'manual',
		paymentId: 'payment',
		at: expect.any(String),
		attempts: 0,
	});
	await failCompletionAttempt(db, 'order', new Error('finish failed'));
	await recordCompletionAttempt(db, { orderUuid: 'order', source: 'replay' });
	expect((await pendingCompletions(db)).order).toEqual({
		...first,
		attempts: 1,
		lastError: 'finish failed',
	});
	await failCompletionAttempt(db, 'order', 'again');
	expect((await pendingCompletions(db)).order).toMatchObject({ attempts: 2, lastError: 'again' });
});
it('resolves only the named order and never resurrects it on late failure', async () => {
	await recordCompletionAttempt(db, attempt);
	await recordCompletionAttempt(db, { ...attempt, orderUuid: 'other' });
	await resolveCompletionAttempt(db, 'order');
	await failCompletionAttempt(db, 'order', 'late');
	expect(Object.keys(await pendingCompletions(db))).toEqual(['other']);
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
