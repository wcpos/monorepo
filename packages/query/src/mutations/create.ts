import { awaitWriteOutcome } from '../await-write-outcome';
import { mintUuid } from '../mint-uuid';
import { isWriteableCollection, type WriteableCollection } from '../engine-adapter/collection-map';
import { findEngineResident, insertEngineResident, type QueryManager } from './resident';
import { ResidentWriteError } from './resident-write-error';
import { convertLocalDateToUTCString } from './date';

export class CreateScopeChangedTwiceError extends Error {
	public constructor(collection: WriteableCollection) {
		super(`Active engine scope changed twice during ${collection} create`);
		this.name = 'ActiveScopeChangedTwiceError';
	}
}

export async function createEngineResident(
	runtime: QueryManager,
	{
		collection: collectionName,
		data,
		awaitRemoteId = false,
	}: { collection: WriteableCollection; data: Record<string, unknown>; awaitRemoteId?: boolean }
) {
	if (!isWriteableCollection(collectionName))
		return new ResidentWriteError(
			new Error(`Collection "${collectionName}" is not engine-writeable`),
			collectionName,
			null
		);
	try {
		const recordId = mintUuid();
		const now = convertLocalDateToUTCString(new Date());
		const payload = {
			...data,
			...(data.date_created_gmt === undefined ? { date_created_gmt: now } : {}),
			...(data.date_modified_gmt === undefined ? { date_modified_gmt: now } : {}),
		};
		let resident: Awaited<ReturnType<typeof insertEngineResident>> | undefined;
		let receipt: Awaited<ReturnType<typeof runtime.engine.write>> | undefined;

		for (let attempt = 0; attempt < 2; attempt += 1) {
			const scopeId = runtime.engine.status().activeScopeId;
			resident = await insertEngineResident({
				manager: runtime,
				collection: collectionName,
				recordId,
				payload,
			});
			// `toMutableJSON()`, never `resident.get('payload')`: RxDB hands back a
			// *Proxy* for object-valued paths, and a Proxy cannot be structured-cloned
			// into the storage worker — the enqueue dies with "#<Object> could not be
			// cloned". See `residentPayload` in write-intents for the seam that now
			// backstops this.
			const { payload: residentPayload } = resident.toMutableJSON() as {
				payload: Record<string, unknown>;
			};
			let writeError: unknown;
			try {
				receipt = await runtime.engine.write({
					collection: collectionName,
					operation: 'create',
					recordId,
					payload: residentPayload,
					...(awaitRemoteId ? { explicit: true } : {}),
				});
			} catch (error) {
				writeError = error;
			}

			if (runtime.engine.status().activeScopeId !== scopeId) {
				await resident.remove();
				if (attempt === 1) {
					throw new CreateScopeChangedTwiceError(collectionName);
				}
				continue;
			}

			if (writeError) {
				await resident.remove();
				throw writeError;
			}
			break;
		}

		if (!resident || !receipt) {
			throw new Error(`Failed to enqueue ${collectionName} create`);
		}

		let currentResident = resident;
		if (awaitRemoteId) {
			await awaitWriteOutcome(runtime.engine, receipt.mutationId);
			const refreshed = await findEngineResident(runtime, collectionName, recordId);
			if (!refreshed) {
				throw new Error(`Engine resident "${recordId}" is missing after its write outcome`);
			}
			currentResident = refreshed;
		}
		return currentResident;
	} catch (error) {
		if (awaitRemoteId || error instanceof CreateScopeChangedTwiceError) throw error;
		return new ResidentWriteError(error, collectionName, null);
	}
}
