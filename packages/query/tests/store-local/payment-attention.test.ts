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
	message: 'Order #1042 was already paid online',
});
const at = (iso: string) => jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(iso);
const listed = (database = db) => firstValueFrom(observePaymentAttention(database));

it('reads no entries before anything is refused', async () => {
	expect(await listed()).toEqual([]);
});

it('a repeat refusal of the same row replaces its entry, never duplicates it', async () => {
	at('2026-10-23T10:00:00.000Z');
	await recordPaymentAttention(db, entry('row'));
	at('2026-10-23T11:00:00.000Z');
	await recordPaymentAttention(db, { ...entry('row'), message: 'Refused again' });
	expect(await listed()).toEqual([
		{ ...entry('row'), message: 'Refused again', refusedAt: '2026-10-23T11:00:00.000Z' },
	]);
});

it('lists the newest refusal first', async () => {
	at('2026-10-23T10:00:00.000Z');
	await recordPaymentAttention(db, entry('older'));
	at('2026-10-23T12:00:00.000Z');
	await recordPaymentAttention(db, entry('newer'));
	at('2026-10-23T11:00:00.000Z');
	await recordPaymentAttention(db, entry('middle'));
	expect((await listed()).map(({ rowId }) => rowId)).toEqual(['newer', 'middle', 'older']);
});

it('Handled deletes the entry and the live list drops it; a later refusal raises it again', async () => {
	await recordPaymentAttention(db, entry('a'));
	await recordPaymentAttention(db, entry('b'));
	const seen: string[][] = [];
	const subscription = observePaymentAttention(db).subscribe((entries) =>
		seen.push(entries.map(({ rowId }) => rowId))
	);
	await resolvePaymentAttention(db, 'a');
	await new Promise((resolve) => setTimeout(resolve, 0));
	subscription.unsubscribe();
	expect(seen.at(-1)).toEqual(['b']);
	const stored = (await db.getLocal<{ entries: Record<string, unknown> }>(
		'payment-attention'
	))!.toJSON(true).data.entries;
	expect(Object.keys(stored)).toEqual(['b']);
	await recordPaymentAttention(db, entry('a'));
	expect((await listed()).map(({ rowId }) => rowId).sort()).toEqual(['a', 'b']);
});

it('survives a fresh handle on the store database (a reload)', async () => {
	await recordPaymentAttention(db, entry('row'));
	await handles[0].close();
	const reopened = await open();
	expect((await listed(reopened)).map(({ rowId }) => rowId)).toEqual(['row']);
});
