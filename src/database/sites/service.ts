import { BehaviorSubject, Subject, Subscription, Observable } from 'rxjs';
import httpClient from '@wcpos/common/src/lib/http';
import Url from '@wcpos/common/src/lib/url-parse';

type SiteDocument = import('./sites').SiteDocument;

const wcNamespace = 'wc/v3';
const wcposNamespace = 'wcpos/v1';

const parseApiUrlFromHeaders = (headers: { link: string }) => {
	const link = headers?.link;
	// @ts-ignore
	const parsed = Url.parseLinkHeader(link);
	return parsed?.['https://api.w.org/']?.url;
};

export class ConnectionService {
	constructor(public readonly site: SiteDocument) {
		this.client = httpClient;

		this._prepare();
	}

	public client;
	public _subjects = {
		status: new Subject(), // connection status
		error: new Subject(), // connection error
		active: new BehaviorSubject(false), // true when something is running, false when not
	};

	public _runningPromise: Promise<void> = Promise.resolve();
	public _subs: Subscription[] = [];

	public status$: Observable<boolean> = undefined as any;
	public error$: Observable<boolean> = undefined as any;
	public active$: Observable<boolean> = undefined as any;

	/**
	 * things that are more complex to not belong into the constructor
	 */
	_prepare() {
		// create getters for the observables
		Object.keys(this._subjects).forEach((key) => {
			Object.defineProperty(this, `${key}$`, {
				get() {
					return this._subjects[key].asObservable();
				},
			});
		});

		this._subjects.status.next('hi');
	}

	async connect(): Promise<any> {
		this._subjects.error.next('');
		this._subjects.status.next('Connecting...');
		return this._fetchHead()
			.then((status) => {
				return this._fetchWcApiUrl();
			})
			.catch((err) => {
				this._subjects.error.next(err.message);
			});
	}

	/**
	 * Fetch WordPress API URL
	 * @param url WordPress URL
	 */
	async _fetchHead(): Promise<any> {
		const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
		return this.client.head(`${protocol}://${this.site.url}`).then((response) => {
			const wpApiUrl = parseApiUrlFromHeaders(response.headers);
			if (wpApiUrl) {
				this._subjects.status.next('WordPress website found');
				return this.site.atomicPatch({ wpApiUrl });
			}
			throw Error('Site does not seem to be a WordPress site');
		});
	}

	/**
	 * Fetch WooCommerce API URL
	 * @param url WordPress API URL
	 */
	async _fetchWcApiUrl(): Promise<any> {
		return (
			this.site.wpApiUrl &&
			this.client.get(this.site.wpApiUrl).then((response) => {
				const namespaces: string[] = response?.data?.namespaces || [];
				if (!namespaces.includes(wcNamespace)) {
					throw Error('WooCommerce API not found');
				} else if (!namespaces.includes(wcposNamespace)) {
					throw Error('WooCommerce POS API not found');
				}
				return this.site.atomicPatch({
					...response.data,
				});
				// const baseAuthUrl = response?.data?.authentication?.wcpos?.authorize;
				// if (baseAuthUrl) {
				// 	return this.site.atomicPatch({
				// 		...response.data,
				// 		wcApiUrl: `${this.site.wpApiUrl + namespace}/`, // enforce trailing slash
				// 		wcApiAuthUrl: baseAuthUrl,
				// 	});
				// }
			})
		);
	}
}
