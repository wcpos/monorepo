import { logError } from './utils';

/**
 * Handles all HTTP interactions with the server.
 */
export class DataFetcher {
	private httpClient: any;
	public endpoint: string;

	constructor(httpClient: any, endpoint: string) {
		this.httpClient = httpClient;
		this.endpoint = endpoint;
	}

	async fetchAllRemoteIds() {
		try {
			return await this.httpClient.get(this.endpoint, {
				params: { fields: ['id', 'date_modified_gmt'], posts_per_page: -1 },
			});
		} catch (error) {
			logError(error, `Failed to fetch all remote IDs from ${this.endpoint}`);
		}
	}

	async fetchRecentRemoteUpdates(modifiedAfter: string) {
		try {
			return await this.httpClient.get(this.endpoint, {
				params: {
					fields: ['id', 'date_modified_gmt'],
					posts_per_page: -1,
					modified_after: modifiedAfter,
				},
			});
		} catch (error) {
			logError(error, `Failed to fetch recent updates from ${this.endpoint}`);
		}
	}

	async fetchRemoteByIDs(data: { include?: number[]; exclude?: number[] }, params: any = {}) {
		try {
			return await this.httpClient.post(this.endpoint, data, {
				headers: { 'X-HTTP-Method-Override': 'GET' },
				params: { _method: 'GET', ...params },
			});
		} catch (error) {
			logError(error, `Failed to fetch records by IDs from ${this.endpoint}`);
		}
	}

	async remotePatch(doc: any, data: any) {
		try {
			let endpoint = `${this.endpoint}/${doc.id}`;
			if (this.endpoint === 'variations') {
				endpoint = `products/${doc.parent_id}/variations/${doc.id}`;
			}
			return await this.httpClient.patch(endpoint, data);
		} catch (error) {
			logError(error, `Failed to patch record ${doc.id} at ${this.endpoint}`);
		}
	}

	async remoteCreate(data: any) {
		try {
			return await this.httpClient.post(this.endpoint, data);
		} catch (error) {
			logError(error, `Failed to create record at ${this.endpoint}`);
		}
	}
}
