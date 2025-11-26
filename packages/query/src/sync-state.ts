import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';
import type { StoreCollection, SyncCollection } from '@wcpos/database';

import type { Logger } from './logger';
import type { RxDocument } from 'rxdb';

interface ServerRecord {
	id: number;
	date_modified_gmt: string;
}

interface SyncStateManagerOptions {
	collection: StoreCollection;
	syncCollection: SyncCollection;
	endpoint: string;
	logger: Logger;
}

/**
 * Manages the sync state of a collection by comparing the local state to the server state.
 */
export class SyncStateManager {
	public collection: StoreCollection;
	public syncCollection: SyncCollection;
	private endpoint: string;
	private logger: Logger;

	constructor({ collection, syncCollection, endpoint, logger }: SyncStateManagerOptions) {
		this.collection = collection;
		this.syncCollection = syncCollection;
		this.endpoint = endpoint;
		this.logger = logger;
	}

	/**
	 * Takes a full audit reponse from the server and updates the sync state accordingly.
	 */
	public async processFullAudit(serverState: ServerRecord[]) {
		const batchSize = 1000;
		let skip = 0;
		let hasMore = true;

		// Create a map of the server state for quick lookup
		const serverStateMap = new Map(serverState.map((record) => [record.id, record]));
		// Keep track of processed IDs
		const processedIds = new Set<number>();

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
				if (!idCounts.has(doc.id)) {
					idCounts.set(doc.id, []);
				}
				idCounts.get(doc.id)!.push(doc);
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

					log.warn(`Removed ${docsToRemove.length} duplicate documents with ID: ${id}`, {
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.DUPLICATE_RECORD,
							id,
							collection: this.collection.name,
						},
					});
				}

				// Remove duplicates from the result array
				result = result.filter((doc) => !duplicateIds.has(doc.id));
			}

			const updates: any[] = [];

			for (const localDoc of result) {
				const remoteDoc = serverStateMap.get(localDoc.id);
				processedIds.add(localDoc.id);
				if (!remoteDoc) {
					/**
					 * @FIXME - this is a hack for the products variations endpoint
					 * I need to be able to limit localData to the parent.variations array
					 */
					if (!/^products\/\d+\/variations$/.test(this.endpoint)) {
						updates.push({
							id: localDoc.id,
							endpoint: this.endpoint,
							status: 'PULL_DELETE',
						});
					} else {
						// debugger;
					}
				} else if (remoteDoc.date_modified_gmt > localDoc.date_modified_gmt) {
					updates.push({
						id: localDoc.id,
						endpoint: this.endpoint,
						status: 'PULL_UPDATE',
					});
				} else if (remoteDoc.date_modified_gmt < localDoc.date_modified_gmt) {
					updates.push({
						id: localDoc.id,
						endpoint: this.endpoint,
						status: 'PUSH_UPDATE',
					});
				} else {
					updates.push({
						id: localDoc.id,
						endpoint: this.endpoint,
						status: 'SYNCED',
					});
				}
			}

			await this.syncCollection.bulkUpsert(updates);
			skip += batchSize;
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
			await this.syncCollection.bulkUpsert(newRecords);
		}
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
			const remoteDoc = serverStateMap.get(localDoc.id);
			processedIds.add(localDoc.id);

			if (remoteDoc && remoteDoc.date_modified_gmt > localDoc.date_modified_gmt) {
				updates.push({
					id: localDoc.id,
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
	 */
	public async processServerResponse(response: any[]) {
		const primaryPath = this.collection.schema.primaryPath;
		const responseMap = new Map(response.map((doc: any) => [doc[primaryPath], doc]));
		const localDocs = await this.collection.findByIds(Array.from(responseMap.keys())).exec();

		if (localDocs.size === 0) {
			const result = await this.collection.bulkInsert(response);
			if (result.success.length > 0) {
				await this.logger.logAddedDocuments(
					result.success.map((doc: any) => doc.id),
					this.collection.name
				);

				const synced = result.success.map((doc: any) => ({
					id: doc.id,
					endpoint: this.endpoint,
					status: 'SYNCED',
				}));
				await this.syncCollection.bulkUpsert(synced);

				if (result.error.length > 0) {
					log.error('Error inserting documents', {
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.DB_INSERT_FAILED,
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

		for (const localDoc of localDocs) {
			const remoteDoc = responseMap.get(localDoc[primaryPath]);
			if (remoteDoc && remoteDoc.date_modified_gmt < localDoc.date_modified_gmt) {
				skipped.push(remoteDoc);
				responseMap.delete(localDoc[primaryPath]);
			}
		}

		if (skipped.length > 0) {
			log.debug('Skipped older documents', { context: { skipped } });
		}

		if (responseMap.size > 0) {
			const result = await this.collection.bulkUpsert(Array.from(responseMap.values()));
			if (result.success.length > 0) {
				await this.logger.logAddedDocuments(
					result.success.map((doc: any) => doc.id),
					this.collection.name
				);

				const synced = result.success.map((doc: any) => ({
					id: doc.id,
					endpoint: this.endpoint,
					status: 'SYNCED',
				}));
				await this.syncCollection.bulkUpsert(synced);

				if (result.error.length > 0) {
					log.error('Error upserting documents', {
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
			const ids = removed.map((doc) => doc.id);
			const result = await this.collection.find({ selector: { id: { $in: ids } } }).remove();
			this.logger.logRemovedDocuments(ids, this.collection.name);

			// removed from sync should match removed from local DB, this should never happen
			if (result.length !== removed.length) {
				log.warn('Mismatch between removed from sync and local DB', {
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
