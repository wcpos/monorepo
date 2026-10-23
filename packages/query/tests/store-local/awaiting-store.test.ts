import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { StoreDatabase } from '@wcpos/database';

import {
	awaitsStore,
	claimRoute,
	failCompletionAttempt,
	markSent,
	type MoneyCommandEntry,
	observeAwaitingStore,
	recordCompletionAttempt,
	resolveCompletionAttempt,
} from '../../src/store-local';
import { deferEntry, settleCommand } from '../../src/store-local/money-commands';

addRxPlugin(RxDBLocalDocumentsPlugin);
let db: StoreDatabase;
beforeEach(async () => {
	db = (await createRxDatabase({
		name: `awaiting${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	})) as unknown as StoreDatabase;
});
afterEach(async () => {
	await db.remove();
});

const entry = (sentAt: string | null, sentRevision: string | null) => ({ sentAt, sentRevision });

// ADR 0040 Decided 1 rule 1: the mark is the journals, never the order status.
it.each([
	['an attempt awaiting adoption', { awaitingAdoption: true as const }, [], true],
	['a deferred record (sent, no revision)', undefined, [entry('2026-10-23T10:00:00Z', null)], true],
	['a sent online entry with a revision', undefined, [entry('2026-10-23T10:00:00Z', 'r1')], false],
	['an unsent crash leftover', undefined, [entry(null, null)], false],
	['a pending attempt not awaiting adoption', {}, [], false],
	['nothing', undefined, [], false],
])('%s → %s', (_label, attempt, entries, expected) => {
	expect(awaitsStore({ attempt, entries })).toBe(expected);
});

const record = (orderUuid: string, id: string): MoneyCommandEntry => ({
	orderUuid,
	kind: 'record',
	path: 'orders/1/payments',
	target: null,
	id,
	body: {},
	approval: { total: '1.00', currency: 'USD' },
	sentAt: null,
	sentRevision: null,
	scope: 'scope',
});
const route = (orderUuid: string, id: string) =>
	({ orderUuid, kind: 'record', target: null, rowId: id }) as const;

it('observeAwaitingStore emits the awaiting set and only when it changes', async () => {
	const emissions: string[][] = [];
	const subscription = observeAwaitingStore(db).subscribe((set) => emissions.push([...set].sort()));
	const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
	await settle();

	// A deferred offline record marks its order.
	await claimRoute(db, route('a', 'row-a'), 'me', record('a', 'row-a'));
	await settle();
	await deferEntry(db, 'a', 'row-a', 'me');
	await settle();
	// An online POST in flight (sent with a revision) does not mark, and does not re-emit.
	await claimRoute(db, route('b', 'row-b'), 'me', record('b', 'row-b'));
	await markSent(db, 'b', 'row-b', 'r1', 'me');
	await settle();
	// The completed offline sale stays marked through its re-send by awaitingAdoption.
	await recordCompletionAttempt(db, { orderUuid: 'a', source: 'manual' });
	await failCompletionAttempt(db, 'a', 'unconfirmed', { awaitingAdoption: true });
	await settleCommand(db, 'a', 'row-a');
	await settle();
	await resolveCompletionAttempt(db, 'a');
	await settle();
	subscription.unsubscribe();

	expect(emissions).toEqual([[], ['a'], []]);
});
