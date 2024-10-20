/**
 * Manages the sync state of a collection.
 */
export class SyncStateManager {
	public syncCollection: any;
	private endpoint: string;

	constructor(syncCollection: any, endpoint: string) {
		this.syncCollection = syncCollection;
		this.endpoint = endpoint;
	}

	async getUnsyncedRemoteIDs() {
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

	async getSyncedRemoteIDs() {
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

	async getRecordsForRemoval() {
		const docsToRemove = await this.syncCollection
			.find({
				selector: {
					id: { $exists: true },
					status: { $eq: 'PULL_DELETE' },
					endpoint: { $eq: this.endpoint },
				},
			})
			.exec();
		return docsToRemove;
	}

	async getStaleIDs() {
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

	async getMappedSyncedStateRecords() {
		const docs = await this.syncCollection
			.find({
				selector: {
					id: { $exists: true },
					endpoint: { $eq: this.endpoint },
				},
			})
			.exec();
		return new Map(docs.map((doc: any) => [doc.id, doc]));
	}

	async updateSyncState(updates: any[]) {
		await this.syncCollection.bulkUpsert(updates);
	}

	async insertNewSyncRecords(records: any[]) {
		await this.syncCollection.bulkInsert(records);
	}
}
