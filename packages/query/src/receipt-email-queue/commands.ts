import { StoreDatabaseUnavailableError } from '../commands/printer-profiles';
import {
	drainReceiptEmailQueue as drain,
	type DrainDeps,
	type DrainLogger,
	enqueueReceiptEmail as enqueue,
	type EnqueueDeps,
	type EnqueueReceiptEmailInput,
	type ReceiptEmailQueuePort,
	removeReceiptEmail as remove,
	retryReceiptEmail as retry,
} from './queue';
import { readAwaitingStoreOrderIds } from '../store-local/awaiting-store';

import type { StoreLocalDatabase } from '../reads/store-local';
import type { LocalDatabaseWithReset } from '../use-local-collection';

export type ReceiptEmailStoreDatabase = LocalDatabaseWithReset | null | undefined;

function receiptEmailQueue(storeDB: ReceiptEmailStoreDatabase): ReceiptEmailQueuePort {
	if (!storeDB) throw new StoreDatabaseUnavailableError();
	return storeDB.collections.receipt_email_queue as ReceiptEmailQueuePort;
}

export function enqueueReceiptEmail(
	input: EnqueueReceiptEmailInput,
	{ storeDB, ...deps }: Omit<EnqueueDeps, 'collection'> & { storeDB: ReceiptEmailStoreDatabase }
) {
	return enqueue({ ...deps, collection: receiptEmailQueue(storeDB) }, input);
}

export async function drainReceiptEmailQueue({
	storeDB,
	...deps
}: Omit<DrainDeps, 'collection' | 'holds'> & { storeDB: ReceiptEmailStoreDatabase }) {
	const collection = receiptEmailQueue(storeDB);
	// ADR 0040 Decided 1 rule 1: the store's copy would show a sale it has not heard as unpaid.
	// Its email stays queued, unpenalised, until the offline record settles; a later drain sends it.
	const awaiting = await readAwaitingStoreOrderIds(storeDB as StoreLocalDatabase);
	return drain({ ...deps, collection, holds: (row) => awaiting.has(row.orderId) });
}

export async function retryReceiptEmail(
	storeDB: ReceiptEmailStoreDatabase,
	localID: string,
	logger?: DrainLogger
) {
	const [doc] = await receiptEmailQueue(storeDB).find({ selector: { localID } }).exec();
	return doc ? retry(doc, logger) : false;
}

export async function removeReceiptEmail(
	storeDB: ReceiptEmailStoreDatabase,
	localID: string,
	logger?: DrainLogger
) {
	const collection = receiptEmailQueue(storeDB);
	const [doc] = await collection.find({ selector: { localID } }).exec();
	return doc ? remove(collection, doc, logger) : false;
}
