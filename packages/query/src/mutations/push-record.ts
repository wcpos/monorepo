import cloneDeep from 'lodash/cloneDeep';

import { awaitWriteOutcome } from '../await-write-outcome';
import {
	WRITEABLE_REMOTE_ID_FIELD,
	type WriteableCollection,
} from '../engine-adapter/collection-map';
import {
	documentRecordId,
	type EngineResident,
	findEngineResident,
	type QueryManager,
} from './resident';

// Slow stores answer order pushes after 15 s (Sentry CHECKOUT101); 45 s covers the
// write drain's 30 s request timeout plus its first retry. Pay spins and stays disabled.
const ORDER_WRITE_OUTCOME_TIMEOUT_MS = 45_000;

type AnyRxDocument = {
	id?: unknown;
	uuid?: string;
	collection: { name: string };
	getLatest(): AnyRxDocument;
};

const REMOTE_ID_FIELD = WRITEABLE_REMOTE_ID_FIELD;

function isWriteableCollection(name: string): name is WriteableCollection {
	return Object.prototype.hasOwnProperty.call(REMOTE_ID_FIELD, name);
}

export async function enqueueRecordWrite(runtime: QueryManager, document: AnyRxDocument) {
	const latest = document.getLatest();
	const collectionName = latest.collection.name;
	if (!isWriteableCollection(collectionName))
		throw new Error(`Collection "${collectionName}" is not engine-writeable`);
	const recordId = documentRecordId(latest);
	if (!recordId) throw new Error(`Missing uuid for ${collectionName} push`);
	const resident = await findEngineResident(runtime, collectionName, recordId);
	if (!resident) {
		throw new Error(`Engine resident "${recordId}" is missing from "${collectionName}"`);
	}
	const remoteId =
		typeof resident.get === 'function'
			? resident.get(REMOTE_ID_FIELD[collectionName])
			: (resident as unknown as Record<string, unknown>)[REMOTE_ID_FIELD[collectionName]];
	const payload = (
		typeof resident.toMutableJSON === 'function'
			? (resident.toMutableJSON().payload ?? {})
			: cloneDeep((resident as unknown as Record<string, unknown>).payload ?? {})
	) as Record<string, unknown>;
	const operation = remoteId == null ? 'create' : 'update';
	// Status is an intent, never an echo (ADR 0040): an order update re-sending the
	// resident's status would reopen a paid order from a stale copy. A queued write that
	// named the status carries it; this row coalesces into it. A create keeps its status.
	if (collectionName === 'orders' && operation === 'update') delete payload.status;
	const receipt = await runtime.engine.write({
		collection: collectionName,
		operation,
		recordId,
		payload,
		...(collectionName === 'orders' ? { explicit: true } : {}),
	});
	return { collectionName, recordId, receipt, resident };
}

/** Re-read the rematerialized resident after a successful write outcome. */
export async function readWrittenResident(
	runtime: QueryManager,
	collectionName: WriteableCollection,
	recordId: string
): Promise<EngineResident> {
	const resident = await findEngineResident(runtime, collectionName, recordId);
	if (!resident) {
		throw new Error(`Engine resident "${recordId}" is missing after its write outcome`);
	}
	return resident;
}

/**
 * Enqueue the current engine resident through the write plane. The passed legacy document is used
 * only for identity: its fields may be stale after an optimistic resident patch. Order pushes wait
 * for a terminal outcome because checkout requires the rematerialized Woo id.
 *
 * A failure is thrown, not reported: every caller logs and toasts it once with its own context
 * (reporting here too doubled the cashier's toast and the Sentry event). Map its code with
 * `pushFailureCode` so a refused session still reads as AUTH101.
 */
export async function pushRecord(
	runtime: QueryManager,
	document: AnyRxDocument
): Promise<EngineResident> {
	const latest = document.getLatest();
	const collectionName = latest.collection.name;
	if (!isWriteableCollection(collectionName)) {
		throw new Error(`Collection "${collectionName}" is not engine-writeable`);
	}
	const recordId = documentRecordId(latest);
	if (!recordId) throw new Error(`Missing uuid for ${collectionName} push`);

	const { receipt, resident } = await enqueueRecordWrite(runtime, document);

	let currentResident = resident;
	if (collectionName === 'orders') {
		await awaitWriteOutcome(runtime.engine, receipt.mutationId, {
			timeoutMs: ORDER_WRITE_OUTCOME_TIMEOUT_MS,
		});
		currentResident = await readWrittenResident(runtime, collectionName, recordId);
	}

	return currentResident;
}
