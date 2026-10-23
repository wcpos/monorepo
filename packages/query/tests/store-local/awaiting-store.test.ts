import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { StoreDatabase } from '@wcpos/database';

import {
	failCompletionAttempt,
	type MoneyCommandEntry,
	observeAwaitingStore,
	recordCompletionAttempt,
} from '../../src/store-local';
import {
	claimRoute,
	deferEntry,
	markSent,
	settleCommand,
} from '../../src/store-local/money-commands';

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
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

// ADR 0040 Decided 1 rule 1: the mark lives exactly as long as the offline record.
it('marks a deferred record through its re-send until the store answers; online sales never mark', async () => {
	const emissions: string[][] = [];
	const subscription = observeAwaitingStore(db).subscribe((set) => emissions.push([...set].sort()));
	await settle();

	// An online POST in flight (sent with a revision), and an `unconfirmed` online close the
	// store already took, are not sales the store has not heard.
	await claimRoute(db, route('online', 'row-o'), 'me', record('online', 'row-o'));
	await markSent(db, 'online', 'row-o', 'r1', 'me');
	await recordCompletionAttempt(db, { orderUuid: 'online', source: 'manual' });
	await failCompletionAttempt(db, 'online', 'unconfirmed', { awaitingAdoption: true });
	await settle();
	// The offline record marks its order, and keeps it through the re-send.
	await claimRoute(db, route('a', 'row-a'), 'me', record('a', 'row-a'));
	await settle();
	await deferEntry(db, 'a', 'row-a', 'me');
	await settle();
	await claimRoute(db, route('a', 'row-a'), 'me', null);
	await markSent(db, 'a', 'row-a', 'r2', 'me');
	await settle();
	// The store answers: the entry settles and the mark goes.
	await settleCommand(db, 'a', 'row-a');
	await settle();
	subscription.unsubscribe();

	expect(emissions).toEqual([[], ['a'], []]);
});

it('shares one stream per store database, replaying its last set to a later subscriber', async () => {
	expect(observeAwaitingStore(db)).toBe(observeAwaitingStore(db));
	const first = observeAwaitingStore(db).subscribe();
	await claimRoute(db, route('a', 'row-a'), 'me', record('a', 'row-a'));
	await deferEntry(db, 'a', 'row-a', 'me');
	await settle();
	let replayed: ReadonlySet<string> | null = null;
	observeAwaitingStore(db)
		.subscribe((set) => (replayed = set))
		.unsubscribe();
	first.unsubscribe();
	expect(replayed).toEqual(new Set(['a']));
});
