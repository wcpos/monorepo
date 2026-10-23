import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';
import { firstValueFrom } from 'rxjs';

import type { StoreDatabase } from '@wcpos/database';

import {
	observePaymentAttention,
	recordPaymentAttention,
	resolvePaymentAttention,
} from '../../src/store-local';
import { RESOLVED_ATTENTION_RETENTION_MS } from '../../src/store-local/payment-attention';

import type { RxDatabase } from 'rxdb';

// Dev mode allows a second handle on one database name: a reload of the same store database.
addRxPlugin(RxDBDevModePlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);

let name: string;
let handles: RxDatabase[];
const open = async () => {
	const db = await createRxDatabase({
		name,
		storage: wrappedValidateZSchemaStorage({ storage: getRxStorageMemory() }),
		localDocuments: true,
		multiInstance: false,
		ignoreDuplicate: true,
	});
	handles.push(db);
	return db as unknown as StoreDatabase;
};
let db: StoreDatabase;
beforeEach(async () => {
	name = `attention${Math.random().toString(36).slice(2)}`;
	handles = [];
	db = await open();
});
afterEach(async () => {
	jest.restoreAllMocks();
	for (const handle of handles.reverse()) if (!handle.closed) await handle.close();
});

const entry = (rowId: string) => ({
	rowId,
	orderUuid: `order-${rowId}`,
	orderId: 42,
	orderNumber: '1042',
	amount: '10.00',
	currency: 'USD',
	methodId: 'pos_cash',
	methodTitle: 'Cash',
	reason: 'order_already_paid' as const,
	message: 'Order #1042 was already paid online',
});
const at = (iso: string) => jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(iso);
const unresolved = (database = db) => firstValueFrom(observePaymentAttention(database));

it('reads no entries before anything is refused', async () => {
	expect(await unresolved()).toEqual([]);
});

it('a second refusal of the same row refreshes its message and time, never duplicates', async () => {
	at('2026-10-23T10:00:00.000Z');
	await recordPaymentAttention(db, entry('row'));
	at('2026-10-23T11:00:00.000Z');
	await recordPaymentAttention(db, { ...entry('row'), message: 'Refused again' });
	expect(await unresolved()).toEqual([
		{
			...entry('row'),
			message: 'Refused again',
			refusedAt: '2026-10-23T11:00:00.000Z',
			resolvedAt: null,
		},
	]);
});

it('lists the newest refusal first', async () => {
	at('2026-10-23T10:00:00.000Z');
	await recordPaymentAttention(db, entry('older'));
	at('2026-10-23T12:00:00.000Z');
	await recordPaymentAttention(db, entry('newer'));
	at('2026-10-23T11:00:00.000Z');
	await recordPaymentAttention(db, entry('middle'));
	expect((await unresolved()).map(({ rowId }) => rowId)).toEqual(['newer', 'middle', 'older']);
});

it('resolve stamps the entry and the live list drops it; a later refusal keeps it handled', async () => {
	await recordPaymentAttention(db, entry('a'));
	await recordPaymentAttention(db, entry('b'));
	const seen: string[][] = [];
	const subscription = observePaymentAttention(db).subscribe((entries) =>
		seen.push(entries.map(({ rowId }) => rowId))
	);
	at('2026-10-23T12:00:00.000Z');
	await resolvePaymentAttention(db, 'a');
	await new Promise((resolve) => setTimeout(resolve, 0));
	subscription.unsubscribe();
	expect(seen.at(-1)).toEqual(['b']);
	const stored = (await db.getLocal<{ entries: Record<string, { resolvedAt: string }> }>(
		'payment-attention'
	))!.toJSON(true).data.entries;
	expect(stored.a.resolvedAt).toBe('2026-10-23T12:00:00.000Z');
	await recordPaymentAttention(db, entry('a'));
	expect((await unresolved()).map(({ rowId }) => rowId)).toEqual(['b']);
});

it('prunes a handled entry once it is older than the retention, on the next write', async () => {
	const now = Date.parse('2026-10-23T12:00:00.000Z');
	// Both stamps before the spy: the spied toISOString would answer for them too.
	const expired = new Date(now - RESOLVED_ATTENTION_RETENTION_MS - 1).toISOString();
	const kept = new Date(now - RESOLVED_ATTENTION_RETENTION_MS + 60_000).toISOString();
	jest.spyOn(Date, 'now').mockReturnValue(now);
	at(expired);
	await recordPaymentAttention(db, entry('old'));
	await resolvePaymentAttention(db, 'old');
	at(kept);
	await recordPaymentAttention(db, entry('recent'));
	await resolvePaymentAttention(db, 'recent');
	const doc = await db.getLocal<{ entries: Record<string, unknown> }>('payment-attention');
	expect(Object.keys(doc!.toJSON(true).data.entries)).toEqual(['recent']);
});

it('survives a fresh handle on the store database (a reload)', async () => {
	await recordPaymentAttention(db, entry('row'));
	await handles[0].close();
	const reopened = await open();
	expect((await unresolved(reopened)).map(({ rowId }) => rowId)).toEqual(['row']);
});
