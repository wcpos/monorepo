import cloneDeep from 'lodash/cloneDeep';
import set from 'lodash/set';

import { recordCollectionName } from '../records/engine-record';
import { getTemporaryOrder, patchTemporaryOrderPayload } from '../temporary-order';
import { convertLocalDateToUTCString } from './date';
import { ResidentWriteError } from './resident-write-error';
import {
	applyEngineResidentChanges,
	assertsSomething,
	documentRecordId,
	type EngineResident,
	type LocalPatchProps,
	patchAndEnqueueEngineResident,
	type PayloadChanges,
	type QueryManager,
	residentPayload,
	resolveEngineResident,
	scopeBarcodeSelectors,
	type ScopedEngineResident,
	syncableChanges,
	type WriteTarget,
	writeTargetCollection,
} from './resident';

import type { WriteableCollection } from '../engine-adapter/collection-map';

async function applyPayloadChanges<TDocument extends WriteTarget>(
	manager: QueryManager,
	collection: WriteableCollection,
	{ document, changes: resolveChanges }: { document: TDocument; changes: PayloadChanges },
	registerId?: string
) {
	const recordId = documentRecordId(document);
	if (!recordId) throw new Error('Payload changes require an engine record');
	let changes: Record<string, unknown> = {};
	const resolve: PayloadChanges = (payload) => {
		changes = cloneDeep(
			Object.fromEntries(
				Object.entries(resolveChanges(payload)).filter(([, value]) => value !== undefined)
			)
		);
		if (Object.keys(changes).length === 0) return changes;
		changes.date_modified_gmt = convertLocalDateToUTCString(new Date());
		return syncableChanges(collection, changes);
	};
	if (collection === 'orders' && (document as { isNew?: boolean }).isNew) {
		const latest = (await getTemporaryOrder(recordId))?.getLatest();
		if (latest && Object.keys(resolve(latest.payload as Record<string, unknown>)).length === 0)
			return { changes, document: latest as TDocument };
	}
	const patched =
		collection === 'orders' && (document as { isNew?: boolean }).isNew
			? await patchTemporaryOrderPayload(recordId, resolve)
			: await patchAndEnqueueEngineResident({
					manager,
					collection,
					recordId,
					changes: resolve,
					registerId: registerId,
				});
	if (!patched) throw new Error('Temporary order is missing from the temporary DB');
	return { changes, document: patched as TDocument };
}

export async function applyLocalPatch<TDocument extends WriteTarget, TData extends object>(
	manager: QueryManager,
	{ document, data, changes: resolveChanges }: LocalPatchProps<TDocument, TData>,
	{
		registerId,
		collectionName,
		explicit,
	}: {
		registerId?: string;
		collectionName?: string;
		/** The row is the cashier asking for the push: an open cart's hold never holds it. */
		explicit?: boolean;
	} = {}
): Promise<{ changes: Record<string, unknown>; document: TDocument; mutationId?: string }> {
	const named = collectionName ?? recordCollectionName(document);
	const engineCollection = writeTargetCollection(document, collectionName);
	try {
		if (!engineCollection) throw new Error(`No write door for collection "${named}"`);
		if (resolveChanges)
			return await applyPayloadChanges(
				manager,
				engineCollection,
				{ document, changes: resolveChanges },
				registerId
			);
		// `cloneDeep`, not a spread: RxDB serves object-valued document fields as
		// **Proxies** (`getDocumentProperty`), nested ones included, and a Proxy
		// cannot be structured-cloned — which is how every optimistic write ends
		// on web (storage in a Worker) and Electron (storage behind ipcRenderer).
		// A caller handing over a field it read off a record would otherwise kill
		// the patch with "#<Object> could not be cloned". Callers pass plain
		// snapshots; this makes a slip a wasted copy instead of a dead write.
		const patchData = cloneDeep(data as Record<string, unknown>);
		const isTemporaryOrder =
			engineCollection === 'orders' && Boolean((document as unknown as { isNew?: boolean }).isNew);
		const patchEntries = Object.entries(patchData).filter(([, value]) => value !== undefined);
		if (patchEntries.length === 0) {
			return { changes: {}, document };
		}
		patchEntries.push(['date_modified_gmt', convertLocalDateToUTCString(new Date())]);

		const recordId = documentRecordId(document);
		if (!recordId) {
			throw new Error(`Missing uuid for ${engineCollection} mutation`);
		}
		let snapshot: Record<string, unknown>;
		let scopedEngineResident: ScopedEngineResident | null = null;
		if (isTemporaryOrder) {
			const resident = await getTemporaryOrder(recordId);
			if (!resident) throw new Error('Temporary order is missing from the temporary DB');
			snapshot = residentPayload(resident as unknown as EngineResident);
		} else {
			scopedEngineResident = await resolveEngineResident(manager, engineCollection, recordId);
			if (!scopedEngineResident) {
				throw new Error(`Engine resident "${recordId}" is missing from "${engineCollection}"`);
			}
			snapshot = residentPayload(scopedEngineResident.resident);
		}
		const changes: Record<string, unknown> = {};
		for (const [key, value] of patchEntries) {
			const [root, ...path] = key.split('.');
			if (path.length === 0) {
				changes[root] = value;
				continue;
			}
			const rootValue = cloneDeep((snapshot as Record<string, unknown>)[root]);
			changes[root] = set(
				(rootValue ?? (Number.isInteger(Number(path[0])) ? [] : {})) as object,
				path,
				value
			);
		}

		if (isTemporaryOrder) {
			// The temporary order is engine-shaped (ADR 0028 stage I); the context
			// hands out the record face, so the write resolves the RAW template
			// through the temp-order repository and merges into its payload.
			const patched = await patchTemporaryOrderPayload(recordId, changes);
			if (!patched) throw new Error('Temporary order is missing from the temporary DB');
			return {
				changes,
				document: patched as TDocument,
			};
		}

		const syncChanges = syncableChanges(engineCollection, changes);
		let patched: EngineResident;
		let mutationId: string | undefined;
		if (
			Object.keys(syncChanges).length > 0 &&
			assertsSomething(engineCollection, syncChanges, snapshot)
		) {
			patched = await patchAndEnqueueEngineResident({
				manager,
				collection: engineCollection,
				recordId,
				changes: syncChanges,
				initial: scopedEngineResident!,
				registerId: registerId,
				...(explicit ? { explicit: true } : {}),
				onEnqueued: (id) => (mutationId = id),
			});
		} else {
			patched = await applyEngineResidentChanges(
				scopedEngineResident!.resident,
				engineCollection,
				syncChanges,
				scopeBarcodeSelectors(scopedEngineResident!.scope, engineCollection)
			);
		}
		// The queued row's id, when this patch queued one: a caller can await its verdict.
		return { changes, document: patched as TDocument, mutationId };
	} catch (error) {
		throw new ResidentWriteError(error, named, documentRecordId(document));
	}
}
