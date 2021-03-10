import { BehaviorSubject, Subject, Subscription, Observable } from 'rxjs';
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
			.then((status) => {})
			.catch((err) => {
				this._subjects.error.next(err.message);
			});
	}

	async _fetchHead(): Promise<any> {
		return this.client.head(`https://${this.site.url}`).then((response) => {
			const wpApiUrl = parseApiUrlFromHeaders(response.headers);
			if (wpApiUrl) {
				this._subjects.status.next('WordPress website found');
				return this.site.atomicPatch({ wpApiUrl });
			}
			throw Error('Site does not seem to be a WordPress site');
		});
	}
}
