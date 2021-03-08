import httpClient from '@wcpos/common/src/lib/http';
import Url from '@wcpos/common/src/lib/url-parse';

type SiteDocument = import('./sites').SiteDocument;

const parseApiUrlFromHeaders = (headers: { link: string }) => {
	const link = headers?.link;
	// @ts-ignore
	const parsed = Url.parseLinkHeader(link);
	return parsed?.['https://api.w.org/']?.url;
};

export class ConnectionService {
	constructor(public readonly site: SiteDocument) {
		this.client = httpClient;
	}

	public client;

	async connect(): Promise<any> {
		return this._fetchHead()
			.then((status) => {
				debugger;
			})
			.catch((err) => {
				debugger;
			});
	}

	async _fetchHead(): Promise<any> {
		return this.client.head(`https://${this.site.url}`).then((response) => {
			const wpApiUrl = parseApiUrlFromHeaders(response.headers);
			if (wpApiUrl) {
				return this.site.atomicPatch({ wpApiUrl });
			}
			throw Error('Site does not seem to be a WordPress site');
		});
	}
}
