// @ts-nocheck
import { BehaviorSubject, Subject, Subscription, Observable } from 'rxjs';
import httpClient from '@wcpos/core/src/lib/http';
import Url from '@wcpos/core/src/lib/url-parse';
import Platform from '@wcpos/core/src/lib/platform';

type SiteDocument = import('./sites').SiteDocument;
interface Status {
	type: 'pending' | 'error' | 'complete';
	message: string;
}

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
		this.connect();
	}

	public client;
	public _subjects = {
		status: new BehaviorSubject<null | Status>(null), // connection status
		active: new BehaviorSubject(false), // true when something is running, false when not
	};

	public _runningPromise: Promise<void> = Promise.resolve();
	public _subs: Subscription[] = [];

	public status$: Observable<null | Status> = undefined as any;
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
	}

	/**
	 * things that are more complex to not belong into the constructor
	 */
	async connect(): Promise<any> {
		this._subjects.status.next({ type: 'pending', message: 'Connecting...' });

		if (this.site.wpApiUrl) {
			return this._quickCheck()
				.then((success) => {
					if (success) {
						this._subjects.status.next({ type: 'complete', message: 'Connected' });
						this._subjects.active.next(true);
					}
				})
				.catch((err) => {
					this._subjects.status.next({ type: 'error', message: err.message });
				});
		}

		return this._fetchHead()
			.then((status) => {
				return this._fetchWcApiUrl();
			})
			.then((success) => {
				if (success) {
					this._subjects.status.next({ type: 'complete', message: 'Connected' });
					this._subjects.active.next(true);
				}
			})
			.catch((err) => {
				console.log(err);
				this._subjects.status.next({ type: 'error', message: err.message });
			});
	}

	/**
	 * Fetch WordPress API URL
	 * @param url WordPress URL
	 */
	async _fetchHead(): Promise<any> {
		let protocol = 'https';
		if (Platform.OS === 'web' && process.env.NODE_ENV === 'development') {
			protocol = 'http';
		}
		return this.client
			.head(`${protocol}://${this.site.getUrlWithoutProtocol()}`)
			.then((response) => {
				// @ts-ignore
				const wpApiUrl = parseApiUrlFromHeaders(response.headers);
				if (wpApiUrl) {
					this._subjects.status.next({ type: 'pending', message: 'WordPress website found' });
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
					name: response.data.name,
					url: response.data.url,
					home: response.data.home,
					gmtOffset: response.data.gmtOffset,
					timezoneString: response.data.timezoneString,
				});
			})
		);
	}

	/**
	 * Fetch WooCommerce API URL
	 * @param url WordPress API URL
	 */
	async _quickCheck(): Promise<any> {
		return this.client.get(this.site.wpApiUrl + wcposNamespace).then((response) => {
			if (response.status !== 200 || response.data.namespace !== wcposNamespace) {
				throw Error('WooCommerce POS API not found');
			} else {
				return true;
			}
		});
	}
}
