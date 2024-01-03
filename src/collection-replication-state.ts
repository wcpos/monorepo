import isEmpty from 'lodash/isEmpty';
import { BehaviorSubject, Observable, Subscription, Subject, interval, combineLatest } from 'rxjs';
import {
	filter,
	tap,
	map,
	switchMap,
	startWith,
	debounceTime,
	distinctUntilChanged,
} from 'rxjs/operators';

import { SubscribableBase } from './subscribable-base';
import { isArrayOfIntegers } from './utils';

import type { RxCollection } from 'rxdb';

export interface QueryHooks {
	preEndpoint?: (collection: RxCollection) => string;
}

interface CollectionReplicationConfig<T extends RxCollection> {
	collection: T;
	httpClient: any;
	hooks?: any;
	endpoint: string;
	errorSubject: Subject<Error>;
}

export class CollectionReplicationState<T extends RxCollection> extends SubscribableBase {
	private hooks: CollectionReplicationConfig<T>['hooks'];
	public readonly endpoint: string;
	public readonly collection: T;
	public readonly httpClient: any;
	private errorSubject: Subject<Error>;

	/**
	 * Internal State
	 */
	private lastFetchRemoteIDsTime = null;
	private pollingTime = 1000 * 60 * 5; // 5 minutes
	private fetchRemoteIDsPromise: Promise<number[]>;

	/**
	 *
	 */
	public readonly subs: Subscription[] = [];
	public readonly subjects = {
		active: new BehaviorSubject<boolean>(false), // true when something is running, false when not
		remoteIDs: new BehaviorSubject<number[]>([]), // emits all remote ids that are known to the replication
		localIDs: new BehaviorSubject<number[]>([]), // emits all local ids that are known to the replication
		lastModified: new BehaviorSubject<string>(null), // emits the date of the last modified document
		paused: new BehaviorSubject<boolean>(true), // true when the replication is paused, start true
	};

	/**
	 *
	 */
	readonly active$: Observable<boolean> = this.subjects.active.asObservable();
	readonly remoteIDs$: Observable<number[]> = this.subjects.remoteIDs.asObservable();
	readonly localIDs$: Observable<number[]> = this.subjects.localIDs.asObservable();
	readonly lastModified$: Observable<string> = this.subjects.lastModified.asObservable();
	readonly paused$: Observable<boolean> = this.subjects.paused.asObservable();

	/**
	 *
	 */
	private firstSyncResolver: (() => void) | null = null;
	public readonly firstSync: Promise<void>;

	/**
	 *
	 */
	constructor({
		collection,
		httpClient,
		hooks,
		endpoint,
		errorSubject,
	}: CollectionReplicationConfig<T>) {
		super();
		this.collection = collection;
		this.httpClient = httpClient;
		this.hooks = hooks || {};
		this.endpoint = endpoint;
		this.errorSubject = errorSubject;

		// Initialize the firstSync promise
		this.firstSync = new Promise<void>((resolve) => {
			this.firstSyncResolver = resolve;
		});

		/**
		 * Push internal subscriptions to the subs array
		 */
		this.subs.push(
			/**
			 * Subscribe to the remoteIDs local document
			 */
			collection
				.getLocal$('audit')
				.pipe(
					filter((localDoc) => !!localDoc),
					map((localDoc) => localDoc.get('remoteIDs'))
				)
				.subscribe((remoteIDs) => {
					this.subjects.remoteIDs.next(remoteIDs);
				}),

			/**
			 * Subscribe to collection changes and track the array of localIDs and lastModified date
			 * @TODO - categories and tags don't have a date_modified_gmt field, what to do?
			 * @TODO - get the IDs without having to construict the whole document
			 */
			collection
				.find({
					selector: {
						id: { $ne: null },
					},
					sort:
						this.collection.name === 'products/categories' ||
						this.collection.name === 'products/tags'
							? undefined
							: [{ date_modified_gmt: 'desc' }],
				})
				.$.subscribe((docs) => {
					/**
					 * @TODO - I need to change the tax-rates schema to make sure id is always integer
					 */
					const ids = docs.map((doc) => parseInt(doc.get('id'), 10));
					const lastModified = docs[0]?.get('date_modified_gmt');
					this.subjects.localIDs.next(ids);
					this.subjects.lastModified.next(lastModified);
				}),

			/**
			 * Set up a polling interval to run the replication
			 */
			this.paused$
				.pipe(
					switchMap((isPaused) => (isPaused ? [] : interval(this.pollingTime).pipe(startWith(0)))),
					filter(() => !this.subjects.paused.getValue())
				)
				.subscribe(async () => {
					this.run();
				})
		);
	}

	/**
	 * Run the collection replication
	 */
	async run({ force }: { force?: boolean } = {}) {
		if (force) {
			this.lastFetchRemoteIDsTime = null;
		}

		await this.auditIDs();

		if (this.firstSyncResolver) {
			this.firstSyncResolver();
			this.firstSyncResolver = null; // Clear the resolver to prevent future calls
		}
	}

	/**
	 *
	 */
	async auditIDs() {
		if (this.isStopped() || this.subjects.active.getValue()) {
			return;
		}

		try {
			const remoteIDs = await this.getRemoteIDs();

			// if (!Array.isArray(remoteIDs) || remoteIDs.length === 0) {
			// 	return;
			// }

			/**
			 * @TODO - variations can be orphaned at the moment, we need a relationship table with parent
			 */
			const remove = this.subjects.localIDs.getValue().filter((id) => !remoteIDs.includes(id));
			if (remove.length > 0 && this.collection.name !== 'variations') {
				// deletion should be rare, only when an item is deleted from the server
				console.warn('removing', remove, 'from', this.collection.name);
				await this.collection.find({ selector: { id: { $in: remove } } }).remove();
			}
		} catch (error) {
			this.errorSubject.next(error);
		}
	}

	/**
	 * Get remote IDs from local storage or from the endpoint
	 */
	async getRemoteIDs() {
		try {
			if (this.lastFetchRemoteIDsTime < new Date().getTime() - this.pollingTime) {
				const remoteIDs = await this.fetchRemoteIDs();
				this.lastFetchRemoteIDsTime = new Date().getTime();
				if (isArrayOfIntegers(remoteIDs)) {
					this.subjects.remoteIDs.next(remoteIDs); // update the remoteIDs subject immediately
					this.collection.upsertLocal('audit', { remoteIDs }); // store the remoteIDs locally
				}
			}

			return this.subjects.remoteIDs.getValue();
		} catch (error) {
			this.errorSubject.next(error);
		}
	}

	/**
	 * Makes a request the the endpoint to fetch all remote IDs
	 * - can be overwritten by the fetchRemoteIDs hook, this is required for variations
	 */
	async fetchRemoteIDs(): Promise<number[]> {
		if (this.hooks?.fetchRemoteIDs) {
			/**
			 * @HACK - this is a bit hacky, but it works for now
			 * Variations is one collection locally, containing all variations
			 * But it is multiple endpoints on the server, one for each product
			 * Maybe we should have a separate collection for each variable product?
			 */
			return this.hooks?.fetchRemoteIDs(this.endpoint, this.collection);
		}

		this.subjects.active.next(true);

		try {
			const response = await this.httpClient.get(this.endpoint, {
				params: { fields: ['id'], posts_per_page: -1 },
			});

			if (!response.data || !Array.isArray(response.data)) {
				throw new Error('Invalid response data for remote IDs');
			}

			return response.data.map((doc) => doc.id);
		} catch (error) {
			this.errorSubject.next(error);
		} finally {
			this.subjects.active.next(false);
		}
	}

	/**
	 * TODO: when collection is reset, the remoteIDs subject is not updated before the
	 * query is called again. I'm not really sure why.
	 */
	async getUnsyncedRemoteIDs() {
		await this.firstSync;
		const remoteIDs = this.subjects.remoteIDs.getValue();
		const localIDs = this.subjects.localIDs.getValue();
		return remoteIDs.filter((id) => !localIDs.includes(id));
	}

	/**
	 *
	 */
	async getStoredRemoteIDs() {
		const doc = await this.collection.getLocal('audit');
		return doc?.get('remoteIDs');
	}

	/**
	 *
	 */
	async fetchUnsynced() {
		if (this.isStopped() || this.subjects.active.getValue()) {
			return;
		}

		const include = await this.getUnsyncedRemoteIDs();
		const lastModified = this.subjects.lastModified.getValue();

		this.subjects.active.next(true);

		try {
			let response;
			if (isEmpty(include)) {
				response = await this.fetchLastModified({ lastModified });
			} else {
				response = await this.fetchUnsyncedRemoteIDs({ include });
			}

			if (!response.data || !Array.isArray(response.data)) {
				throw new Error('Invalid response data for query replication');
			}

			const promises = response.data.map(async (doc) => {
				const parsedData = this.collection.parseRestResponse(doc);
				await this.collection.upsertRefs(parsedData); // upsertRefs mutates the parsedData
				return parsedData;
			});

			const documents = await Promise.all(promises);

			await this.collection.bulkUpsert(documents);
		} catch (error) {
			this.errorSubject.next(error);
		} finally {
			this.subjects.active.next(false);
		}
	}

	/**
	 *
	 */
	async fetchUnsyncedRemoteIDs({ include }) {
		this.subjects.active.next(true);

		const response = await this.httpClient.post(
			this.endpoint,
			{
				include,
			},
			{
				headers: {
					'X-HTTP-Method-Override': 'GET',
				},
			}
		);

		return response;
	}

	/**
	 *
	 */
	async fetchLastModified({ lastModified }) {
		const response = await this.httpClient.get(this.endpoint, {
			params: {
				modified_after: lastModified,
			},
		});

		return response;
	}

	/**
	 * Total count is the number of remote IDs, plus any local docs without an ID
	 */
	get total$() {
		return combineLatest([this.remoteIDs$, this.unsyncedLocalDocs$]).pipe(
			map(([remoteIDs, unsyncedLocalDocs]) => {
				return (remoteIDs || []).length + (unsyncedLocalDocs || []).length;
			})
		);
	}

	/**
	 * Don't use this, total$ is subscribed and it throws an error because we can't
	 * unsubscribe when the collection is reset. Use the subs above instead.
	 */
	// get remoteIDs$() {
	// 	return this.collection.getLocal$('audit').pipe(
	// 		map((doc) => {
	// 			return doc?.get('remoteIDs');
	// 		})
	// 	);
	// }

	get unsyncedLocalDocs$() {
		return this.collection.find({ selector: { id: null } }).$;
	}

	/**
	 * Remote mutations patch/create
	 * I'm not 100% sure this is the right spot for these, but I'm thinking in the future
	 * there will have to be some kind of queuing system for when the app is offline
	 */
	async remotePatch(doc, data) {
		try {
			if (!doc.id) {
				throw new Error('document does not have an id');
			}
			const response = await this.httpClient.patch(this.endpoint + '/' + doc.id, data);
			const parsedData = this.collection.parseRestResponse(response.data);
			await this.collection.upsertRefs(parsedData); // upsertRefs mutates the parsedData
			await doc.incrementalPatch(parsedData);
			return doc;
		} catch (error) {
			this.errorSubject.next(error);
		}
	}

	async remoteCreate(data) {
		try {
			const response = await this.httpClient.post(this.endpoint, data);
			const parsedData = this.collection.parseRestResponse(response.data);
			await this.collection.upsertRefs(parsedData); // upsertRefs mutates the parsedData
			const doc = await this.collection.upsert(parsedData);
			return doc;
		} catch (error) {
			this.errorSubject.next(error);
		}
	}

	/**
	 * We need to a way to pause and start the replication, eg: when the user is offline
	 */
	start() {
		this.subjects.paused.next(false);
	}

	pause() {
		this.subjects.paused.next(true);
	}

	isStopped() {
		return this.isCanceled || this.subjects.paused.getValue();
	}
}
