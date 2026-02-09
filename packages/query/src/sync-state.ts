import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';
import type { SyncCollection } from '@wcpos/database';

import { yieldToEventLoop } from './yield';

import type { RxCollection, RxDocument } from 'rxdb';

const syncLogger = getLogger(['wcpos', 'sync', 'state']);

interface ServerRecord {
	id: number;
	date_modified_gmt: string;
}

interface SyncStateManagerOptions {
	collection: RxCollection;
	syncCollection: SyncCollection;
	endpoint: string;
}

/**
 * Manages the sync state of a collection by comparing the local state to the server state.
 */
export class SyncStateManager {
	public collection: RxCollection;
	public syncCollection: SyncCollection;
	private endpoint: string;

	/**
	 * Mutex lock to prevent concurrent processServerResponse calls
	 * This prevents race conditions where the same documents are inserted twice
	 */
	private processLock: Promise<void> = Promise.resolve();

	constructor({ collection, syncCollection, endpoint }: SyncStateManagerOptions) {
		this.collection = collection;
		this.syncCollection = syncCollection;
		this.endpoint = endpoint;
	}

	/**
	 * Takes a full audit response from the server and updates the sync state accordingly.
	 *
	 * For large datasets (100k+ records), this method yields to the event loop
	 * between batches to prevent UI blocking.
	 */
	public async processFullAudit(serverState: ServerRecord[]) {
		const batchSize = 1000;
		let skip = 0;
		let hasMore = true;
		let batchCount = 0;

		// Create a map of the server state for quick lookup
		const serverStateMap = new Map(serverState.map((record) => [record.id, record]));
		// Keep track of processed IDs
		const processedIds = new Set<number>();

		syncLogger.debug(`Starting full audit: ${serverState.length} server records`, {
			context: { endpoint: this.endpoint, serverRecords: serverState.length },
		});

		while (hasMore) {
			let result = await this.collection
				.find({
					selector: { id: { $exists: true } },
					skip,
					limit: batchSize,
					sort: [{ id: 'asc' }],
				})
				.exec();

			if (result.length === 0) {
				hasMore = false;
				continue;
			}

			// Check for duplicate IDs in the result array
			const idCounts = new Map<number, RxDocument[]>();
			for (const doc of result) {
				const docId = doc.id as number;
				if (!idCounts.has(docId)) {
					idCounts.set(docId, []);
				}
				idCounts.get(docId)!.push(doc);
			}

			// Find IDs with duplicates
			const duplicateIds = new Set<number>();
			for (const [id, docs] of idCounts.entries()) {
				if (docs.length > 1) {
					duplicateIds.add(id);
				}
			}

			// Delete duplicate documents from the local database
			if (duplicateIds.size > 0) {
				for (const id of duplicateIds) {
					// Get all documents with this ID
					const docsToRemove = idCounts.get(id)!;

					// Remove each document from the database
					for (const doc of docsToRemove) {
						await doc.remove();
					}

					syncLogger.warn(`Removed ${docsToRemove.length} duplicate documents with ID: ${id}`, {
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.DUPLICATE_RECORD,
							id,
							collection: this.collection.name,
						},
					});
				}

				// Remove duplicates from the result array
				result = result.filter((doc: any) => !duplicateIds.has(doc.id));
			}

			const updates: any[] = [];

			for (const localDoc of result) {
				const localId = localDoc.id as number;
				const localDateModified = localDoc.date_modified_gmt as string;
				const remoteDoc = serverStateMap.get(localId);
				processedIds.add(localId);
				if (!remoteDoc) {
					/**
					 * @FIXME - this is a hack for the products variations endpoint
					 * I need to be able to limit localData to the parent.variations array
					 */
					if (!/^products\/\d+\/variations$/.test(this.endpoint)) {
						updates.push({
							id: localId,
							endpoint: this.endpoint,
							status: 'PULL_DELETE',
						});
					} else {
						// debugger;
					}
				} else if (remoteDoc.date_modified_gmt > localDateModified) {
					updates.push({
						id: localId,
						endpoint: this.endpoint,
						status: 'PULL_UPDATE',
					});
				} else if (remoteDoc.date_modified_gmt < localDateModified) {
					updates.push({
						id: localId,
						endpoint: this.endpoint,
						status: 'PUSH_UPDATE',
					});
				} else {
					updates.push({
						id: localId,
						endpoint: this.endpoint,
						status: 'SYNCED',
					});
				}
			}

			await this.syncCollection.bulkUpsert(updates);
			skip += batchSize;
			batchCount++;

			// Yield to event loop every batch to prevent UI blocking
			// This is especially important for large datasets (100k+ records)
			await yieldToEventLoop();
		}

		// Handle server records that don't exist locally
		const newRecords = Array.from(serverStateMap.entries())
			.filter(([id]) => !processedIds.has(id))
			.map(([id]) => ({
				id,
				endpoint: this.endpoint,
				status: 'PULL_NEW',
			}));

		if (newRecords.length > 0) {
			// Process new records in small chunks with yielding to keep UI responsive
			// Smaller chunks = more yields = smoother UI, but slightly slower overall
			// 500 is a good balance for IndexedDB writes
			const newRecordChunkSize = 500;
			const totalChunks = Math.ceil(newRecords.length / newRecordChunkSize);

			for (let i = 0; i < newRecords.length; i += newRecordChunkSize) {
				const chunk = newRecords.slice(i, i + newRecordChunkSize);
				await this.syncCollection.bulkUpsert(chunk);

				// Yield after every chunk to keep UI responsive
				await yieldToEventLoop();

				// Log progress for large sets
				if (newRecords.length > 5000) {
					const chunkNum = Math.floor(i / newRecordChunkSize) + 1;
					if (chunkNum % 10 === 0 || chunkNum === totalChunks) {
						syncLogger.debug(`Audit progress: ${chunkNum}/${totalChunks} chunks`, {
							context: {
								endpoint: this.endpoint,
								processed: Math.min(i + newRecordChunkSize, newRecords.length),
								total: newRecords.length,
							},
						});
					}
				}
			}
		}

		syncLogger.debug(`Full audit complete: ${batchCount} batches, ${processedIds.size} processed`, {
			context: {
				endpoint: this.endpoint,
				batches: batchCount,
				processed: processedIds.size,
				newRecords: newRecords.length,
			},
		});
	}

	/**
	 * Takes modified after response from the server and updates the sync state accordingly.
	 * - generally this should be a small set of records, so we can just process them one by one
	 */
	public async processModifiedAfter(serverState: ServerRecord[]) {
		// Create a map of the server state for quick lookup
		const serverStateMap = new Map(serverState.map((record) => [record.id, record]));
		// Keep track of processed IDs
		const processedIds = new Set<number>();

		const result = await this.collection
			.find({ selector: { id: { $in: Array.from(serverStateMap.keys()) } } })
			.exec();

		const updates: any[] = [];

		for (const localDoc of result) {
			const localId = localDoc.id as number;
			const remoteDoc = serverStateMap.get(localId);
			processedIds.add(localId);

			if (remoteDoc && remoteDoc.date_modified_gmt > (localDoc.date_modified_gmt as string)) {
				updates.push({
					id: localId,
					endpoint: this.endpoint,
					status: 'PULL_UPDATE',
				});
			}
		}

		await this.syncCollection.bulkUpsert(updates);

		// Handle server records that don't exist locally
		const newRecords = Array.from(serverStateMap.entries())
			.filter(([id]) => !processedIds.has(id))
			.map(([id]) => ({
				id,
				endpoint: this.endpoint,
				status: 'PULL_NEW',
			}));

		if (newRecords.length > 0) {
			await this.syncCollection.bulkUpsert(newRecords);
		}
	}

	/**
	 * Save the server response to the local DB and sync state
	 * @NOTE - we need to make sure we are not overwriting a newer date_modified_gmt
	 * @NOTE - uses a mutex lock to prevent race conditions from concurrent calls
	 */
	public async processServerResponse(response: any[]) {
		// Wait for any pending operation to complete
		const previousLock = this.processLock;
		let releaseLock: () => void;
		this.processLock = new Promise((resolve) => {
			releaseLock = resolve;
		});

		try {
			await previousLock;
			return await this._processServerResponseInternal(response);
		} finally {
			releaseLock!();
		}
	}

	/**
	 * Internal implementation of processServerResponse (called within mutex lock)
	 */
	private async _processServerResponseInternal(response: any[]) {
		const primaryPath = this.collection.schema.primaryPath;
		const responseMap = new Map(response.map((doc: any) => [doc[primaryPath], doc]));
		const localDocs = await this.collection.findByIds(Array.from(responseMap.keys())).exec();

		if (localDocs.size === 0) {
			const result = await this.collection.bulkInsert(response);
			if (result.success.length > 0) {
				syncLogger.info(`Synced new ${this.collection.name}`, {
					saveToDb: true,
					context: { ids: result.success.map((doc: any) => doc.id) },
				});

				const synced = result.success.map((doc: any) => ({
					id: doc.id,
					endpoint: this.endpoint,
					status: 'SYNCED',
				}));
				await this.syncCollection.bulkUpsert(synced);

				if (result.error.length > 0) {
					syncLogger.error('Error inserting documents', {
						showToast: true,
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.INSERT_FAILED,
							collection: this.collection.name,
							errors: result.error,
						},
					});
				}
			}

			return result;
		}

		// If the local docs exist, we need to make sure we are not overwriting a newer date_modified_gmt
		const skipped: any[] = [];

		for (const [, localDoc] of localDocs) {
			const remoteDoc = responseMap.get((localDoc as any)[primaryPath]);
			if (remoteDoc && remoteDoc.date_modified_gmt < (localDoc as any).date_modified_gmt) {
				skipped.push(remoteDoc);
				responseMap.delete((localDoc as any)[primaryPath]);
			}
		}

		if (skipped.length > 0) {
			syncLogger.debug('Skipped older documents', { context: { skipped } });
		}

		if (responseMap.size > 0) {
			const result = await this.collection.bulkUpsert(Array.from(responseMap.values()));
			if (result.success.length > 0) {
				syncLogger.info(`Synced ${this.collection.name}`, {
					saveToDb: true,
					context: { ids: result.success.map((doc: any) => doc.id) },
				});

				const synced = result.success.map((doc: any) => ({
					id: doc.id,
					endpoint: this.endpoint,
					status: 'SYNCED',
				}));
				await this.syncCollection.bulkUpsert(synced);

				if (result.error.length > 0) {
					syncLogger.error('Error upserting documents', {
						showToast: true,
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.DB_UPSERT_FAILED,
							collection: this.collection.name,
							errors: result.error,
						},
					});
				}
			}

			return result;
		}
	}

	/**
	 *
	 */
	public async removeStaleRecords() {
		const removed = await this.syncCollection
			.find({
				selector: {
					id: { $exists: true },
					status: { $eq: 'PULL_DELETE' },
					endpoint: { $eq: this.endpoint },
				},
			})
			.remove();

		if (removed.length > 0) {
			const ids = removed.map((doc: any) => doc.id);
			const result = await this.collection.find({ selector: { id: { $in: ids } } }).remove();

			syncLogger.info(`Removed ${this.collection.name}`, {
				saveToDb: true,
				context: { ids },
			});

			// removed from sync should match removed from local DB, this should never happen
			if (result.length !== removed.length) {
				syncLogger.warn('Mismatch between removed from sync and local DB', {
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.DB_REMOVE_MISMATCH,
						collection: this.collection.name,
						syncRemoved: removed.length,
						localRemoved: result.length,
					},
				});
			}

			return result;
		}
	}

	/**
	 * Returns the IDs of records that need to be synced
	 */
	public async getUnsyncedRemoteIDs() {
		const docs = await this.syncCollection
			.find({
				selector: {
					id: { $exists: true },
					status: { $eq: 'PULL_NEW' },
					endpoint: { $eq: this.endpoint },
				},
			})
			.exec();
		return docs.map((doc: any) => doc.id);
	}

	/**
	 * Returns the IDs of records that have been synced
	 */
	public async getSyncedRemoteIDs() {
		const docs = await this.syncCollection
			.find({
				selector: {
					id: { $exists: true },
					status: { $ne: 'PULL_NEW' },
					endpoint: { $eq: this.endpoint },
				},
			})
			.exec();
		return docs.map((doc: any) => doc.id);
	}

	/**
	 * Returns the IDs of records that need to be updated
	 */
	public async getUpdatedRemoteIDs() {
		const docs = await this.syncCollection
			.find({
				selector: {
					id: { $exists: true },
					status: { $eq: 'PULL_UPDATE' },
					endpoint: { $eq: this.endpoint },
				},
			})
			.exec();
		return docs.map((doc: any) => doc.id);
	}
}
