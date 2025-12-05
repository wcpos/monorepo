/**
 * Handles all HTTP interactions with the server.
 * This is a thin pass-through layer - errors propagate up to the caller.
 */
export class DataFetcher {
	private httpClient: any;
	public endpoint: string;

	constructor(httpClient: any, endpoint: string) {
		this.httpClient = httpClient;
		this.endpoint = endpoint;
	}

	fetchAllRemoteIds() {
		return this.httpClient.get(this.endpoint, {
			params: { fields: ['id', 'date_modified_gmt'], posts_per_page: -1 },
		});
	}

	fetchRecentRemoteUpdates(modifiedAfter: string) {
		return this.httpClient.get(this.endpoint, {
			params: {
				fields: ['id', 'date_modified_gmt'],
				posts_per_page: -1,
				modified_after: modifiedAfter,
			},
		});
	}

	fetchRemoteByIDs(data: { include?: number[]; exclude?: number[] }, params: any = {}) {
		return this.httpClient.post(this.endpoint, data, {
			headers: { 'X-HTTP-Method-Override': 'GET' },
			params: { _method: 'GET', ...params },
		});
	}

	remotePatch(doc: any, data: any) {
		let endpoint = `${this.endpoint}/${doc.id}`;
		if (this.endpoint === 'variations') {
			endpoint = `products/${doc.parent_id}/variations/${doc.id}`;
		}
		return this.httpClient.patch(endpoint, data);
	}

	remoteCreate(data: any) {
		return this.httpClient.post(this.endpoint, data);
	}
}
