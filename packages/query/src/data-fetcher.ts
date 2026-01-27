/**
 * Handles all HTTP interactions with the server.
 * This is a thin pass-through layer - errors propagate up to the caller.
 *
 * All methods accept an optional AbortSignal for cancellation support.
 * The signal should be passed from the parent class's AbortController.
 */
export class DataFetcher {
	private httpClient: any;
	public endpoint: string;

	constructor(httpClient: any, endpoint: string) {
		this.httpClient = httpClient;
		this.endpoint = endpoint;
	}

	fetchAllRemoteIds(signal?: AbortSignal) {
		return this.httpClient.get(this.endpoint, {
			params: { fields: ['id', 'date_modified_gmt'], posts_per_page: -1 },
			signal,
		});
	}

	fetchRecentRemoteUpdates(modifiedAfter: string, signal?: AbortSignal) {
		return this.httpClient.get(this.endpoint, {
			params: {
				fields: ['id', 'date_modified_gmt'],
				posts_per_page: -1,
				modified_after: modifiedAfter,
			},
			signal,
		});
	}

	fetchRemoteByIDs(
		data: { include?: number[]; exclude?: number[] },
		params: any = {},
		signal?: AbortSignal
	) {
		return this.httpClient.post(this.endpoint, data, {
			headers: { 'X-HTTP-Method-Override': 'GET' },
			params: { _method: 'GET', ...params },
			signal,
		});
	}

	remotePatch(doc: any, data: any, signal?: AbortSignal) {
		let endpoint = `${this.endpoint}/${doc.id}`;
		if (this.endpoint === 'variations') {
			endpoint = `products/${doc.parent_id}/variations/${doc.id}`;
		}
		return this.httpClient.patch(endpoint, data, { signal });
	}

	remoteCreate(data: any, signal?: AbortSignal) {
		return this.httpClient.post(this.endpoint, data, { signal });
	}
}
