import type { StoreDatabase } from '@wcpos/database';

/**
 *
 */
export class Logger {
	private storeDB: StoreDatabase;

	constructor(storeDB: StoreDatabase) {
		this.storeDB = storeDB;
	}

	async logInvalidResponse(message: string) {
		return this.storeDB.collections.logs.insert({
			level: 'error',
			timestamp: Date.now(),
			message,
			context: { message: 'See console for more details' },
		});
	}

	async logFetchStatus(endpoint: string, headers: any, type: string) {
		const message = type === 'updates' ? 'Checked for updates' : 'Fetched all IDs for';
		return this.storeDB.collections.logs.insert({
			timestamp: Date.now(),
			message: `${message} ${endpoint}`,
			context: {
				total: headers?.['x-wp-total'] ?? 'unknown',
				execution_time: headers?.['x-execution-time'] ?? 'unknown',
				server_load: headers?.['x-server-load'] ?? 'unknown',
			},
		});
	}

	async logAddedDocuments(ids: number[], collectionName: string) {
		return this.storeDB.collections.logs.insert({
			timestamp: Date.now(),
			message: `Synced new ${collectionName}`,
			context: { ids },
		});
	}

	async logUpdatedDocuments(ids: number[], collectionName: string) {
		return this.storeDB.collections.logs.insert({
			timestamp: Date.now(),
			message: `Synced updated ${collectionName}`,
			context: { ids },
		});
	}

	async logRemovedDocuments(ids: number[], collectionName: string) {
		return this.storeDB.collections.logs.insert({
			timestamp: Date.now(),
			message: `Removed ${collectionName}`,
			context: { ids },
		});
	}
}
