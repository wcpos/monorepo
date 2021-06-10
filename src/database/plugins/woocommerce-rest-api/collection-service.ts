import { BehaviorSubject, Subject, Subscription, Observable } from 'rxjs';

type RxCollection = import('rxdb/dist/types').RxCollection;
type RestApiSyncPullOptions = import('./types').RestApiSyncPullOptions;
type RestApiSyncPushOptions = import('./types').RestApiSyncPushOptions;

export class RxDBWooCommerceRestApiSyncCollectionService {
	constructor(
		public readonly collection: RxCollection,
		public readonly url: string,
		public auth: { [k: string]: string },
		public readonly pull: RestApiSyncPullOptions,
		public readonly push: RestApiSyncPushOptions,
		public readonly deletedFlag: string,
		public readonly lastPulledRevField: string,
		public readonly live: boolean,
		public liveInterval: number,
		public retryTime: number,
		public readonly syncRevisions: boolean
	) {
		// this.client = GraphQLClient({
		// 	url,
		// 	headers,
		// });
		this.client = '';
		// this.endpointHash = hash(url);
		this.endpointHash = '';
		this._prepare();
	}

	public client: any;
	public endpointHash: string;
	public _subjects = {
		recieved: new Subject(), // all documents that are recieved from the endpoint
		send: new Subject(), // all documents that are send to the endpoint
		error: new Subject(), // all errors that are revieced from the endpoint, emits new Error() objects
		canceled: new BehaviorSubject(false), // true when the replication was canceled
		active: new BehaviorSubject(false), // true when something is running, false when not
		initialReplicationComplete: new BehaviorSubject(false), // true the initial replication-cycle is over
	};

	public _runningPromise: Promise<void> = Promise.resolve();
	public _subs: Subscription[] = [];

	public _runQueueCount = 0;
	public _runCount = 0; // used in tests

	public initialReplicationComplete$: Observable<any> = undefined as any;

	public recieved$: Observable<any> = undefined as any;
	public send$: Observable<any> = undefined as any;
	public error$: Observable<any> = undefined as any;
	public canceled$: Observable<any> = undefined as any;
	public active$: Observable<boolean> = undefined as any;

	/**
	 *
	 */
	_prepare() {
		// stop sync when collection gets destroyed
		this.collection.onDestroy.then(() => {
			this.cancel();
		});

		// create getters for the observables
		Object.keys(this._subjects).forEach((key) => {
			Object.defineProperty(this, `${key}$`, {
				get() {
					return this._subjects[key].asObservable();
				},
			});
		});
	}

	isStopped(): boolean {
		// if (!this.live && this._subjects.initialReplicationComplete._value) return true;
		// if (this._subjects.canceled._value) return true;
		return false;
	}

	// ensures this._run() does not run in parallel
	async run(retryOnFail = true): Promise<boolean> {
		return this._run(retryOnFail);
	}

	/**
	 * returns true if retry must be done
	 */
	async _run(retryOnFail = true): Promise<boolean> {
		// eslint-disable-next-line no-plusplus
		this._runCount++;

		if (this.push) {
			const ok = await this.runPush();
			if (!ok && retryOnFail) {
				setTimeout(() => this.run(), this.retryTime);
				/*
					Because we assume that conflicts are solved on the server side,
					if push failed, do not attempt to pull before push was successful
					otherwise we do not know how to merge changes with the local state
				*/
				return true;
			}
		}

		if (this.pull) {
			const ok = await this.runPull();
			if (!ok && retryOnFail) {
				setTimeout(() => this.run(), this.retryTime);
				return true;
			}
		}

		return false;
	}

	/**
	 * @return true if sucessfull
	 */
	async runPull(): Promise<boolean> {
		// const latestDocument = await getLastPullDocument(this.collection, this.endpointHash);
		let result;
		try {
			result = await this.collection.database.httpClient.get(this.collection.name);
			// if (result.errors) {
			// 	if (typeof result.errors === 'string') {
			// 		throw new Error(result.errors);
			// 	} else {
			// 		const err: any = new Error('unknown errors occured - see innerErrors for more details');
			// 		err.innerErrors = result.errors;
			// 		throw err;
			// 	}
			// }
		} catch (err) {
			if (err.response) {
				// client received an error response (5xx, 4xx)
				console.log(err.response);
				this._subjects.error.next({ code: err.response.status, message: err.response.statusText });
			} else if (err.request) {
				// client never received a response, or request never left
				console.log(err.request);
				this._subjects.error.next({ message: 'Request Error' });
			} else {
				// anything else
				console.log(err);
				this._subjects.error.next({ message: 'Unknown Error' });
			}
			return false;
		}

		const { data } = result;
		await this.collection.bulkUpsertFromServer(data);

		return true;
	}

	/**
	 * @return true if successfull, false if not
	 */
	async runPush(): Promise<boolean> {
		console.log('hi');
		return false;
	}

	cancel(): Promise<any> {
		if (this.isStopped()) return Promise.resolve(false);
		this._subs.forEach((sub) => sub.unsubscribe());
		this._subjects.canceled.next(true);
		return Promise.resolve(true);
	}
}
