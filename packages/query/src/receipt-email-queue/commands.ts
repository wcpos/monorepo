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

export function drainReceiptEmailQueue({
	storeDB,
	...deps
}: Omit<DrainDeps, 'collection'> & { storeDB: ReceiptEmailStoreDatabase }) {
	return drain({ ...deps, collection: receiptEmailQueue(storeDB) });
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
