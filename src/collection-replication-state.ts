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

import type { StoreDatabase } from '@wcpos/database';

import { SubscribableBase } from './subscribable-base';
import { isArrayOfIntegers } from './utils';

type Collection = StoreDatabase['collections'][keyof StoreDatabase['collections']];

export interface QueryHooks {
	preEndpoint?: (collection: Collection) => string;
}

interface CollectionReplicationConfig<Collection> {
	collection: Collection;
	httpClient: any;
	hooks?: any;
	endpoint: string;
	errorSubject: Subject<Error>;
}

export class CollectionReplicationState<T extends Collection> extends SubscribableBase {
	private hooks: CollectionReplicationConfig<T>['hooks'];
	public readonly endpoint: string;
	public readonly collection: T;
	public readonly storeDB: StoreDatabase;
	public readonly httpClient: any;
	private errorSubject: Subject<Error>;

	/**
	 * Internal State
	 */
	private lastFetchRemoteIDsTime = null;
	private lastFetchUnsyncedTime = null;
	private pollingTime = 1000 * 60 * 5; // 5 minutes
	public readonly subs: Subscription[] = [];

	/**
	 * All public observables should be exposed as subjects so they can be completed on cancel
	 */
	public readonly subjects = {
		active: new BehaviorSubject<boolean>(false), // true when something is running, false when not
		paused: new BehaviorSubject<boolean>(true), // true when the replication is paused, start true
		total: new BehaviorSubject<number>(0), // total number of documents
	};

	/**
	 * Public Observables
	 */
	readonly active$: Observable<boolean> = this.subjects.active.asObservable();
	readonly paused$: Observable<boolean> = this.subjects.paused.asObservable();
	readonly total$: Observable<number> = this.subjects.total.asObservable();

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
		this.storeDB = collection.database;
		this.httpClient = httpClient;
		this.hooks = hooks || {};
		this.endpoint = endpoint;
		this.errorSubject = errorSubject;

		// Initialize the firstSync promise
		this.firstSync = new Promise<void>((resolve) => {
			this.firstSyncResolver = resolve;
		});

		/**
		 * Push all internal subscriptions to the subs array
		 * Internal subscriptions are cleaned up when replication is canceled
		 */
		this.subs.push(
			/**
			 * Subscribe to remote and local collections to calculate the total number of documents
			 */
			combineLatest([
				// remote record count
				this.storeDB.collections.sync
					.find({ selector: { endpoint: this.endpoint } })
					.$.pipe(distinctUntilChanged((a, b) => a.length === b.length)),
				// local unsynced record count
				this.collection
					.find({
						selector: {
							id: { $eq: null },
						},
					})
					.$.pipe(distinctUntilChanged((a, b) => a.length === b.length)),
			]).subscribe(([remote, local]) => {
				console.log('total count triggered', this.endpoint);
				this.subjects.total.next(remote.length + local.length);
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
			this.lastFetchUnsyncedTime = null;
		}

		if (this.isStopped() && force) {
			this.start();
		}

		/**
		 * Run can be called multiple times during a page render, so we need to make sure we only
		 * run the replication once at a time.
		 *
		 * Fetching the remote state will update the sync collection, which triggers other events
		 * such as the total count, fetching updated documents, removing orphaned documents etc
		 */
		if (this.lastFetchRemoteIDsTime < new Date().getTime() - this.pollingTime) {
			this.lastFetchRemoteIDsTime = new Date().getTime();
			const remoteState = await this.fetchRemoteState();
			await this.audit(remoteState);
		}

		if (this.firstSyncResolver) {
			this.firstSyncResolver();
			this.firstSyncResolver = null; // Clear the resolver to prevent future calls
		}
	}

	/**
	 *
	 */
	async audit(remoteState) {
		const localDocs = await this.collection.find().exec();
		const localIDs = localDocs.map((doc) => doc.get('id')).filter((id) => Number.isInteger(id));
		const remoteIDs = remoteState.map((doc) => doc.get('id')).filter((id) => Number.isInteger(id));

		// Find all local docs that are not in the remote state
		const remove = localIDs.filter((id) => !remoteIDs.includes(id));
		if (remove.length > 0 && this.collection.name !== 'variations') {
			// deletion should be rare, only when an item is deleted from the server
			console.warn('removing', remove, 'from', this.collection.name);
			await this.collection.find({ selector: { id: { $in: remove } } }).remove();
		}

		// Find all remote docs that have been updated
		const localMap = new Map(localDocs.map((doc) => [doc.id, doc.date_modified_gmt]));

		const updatedIds = remoteState
			.filter((remoteDoc) => {
				const localDate = localMap.get(remoteDoc.id);
				return localDate && remoteDoc.date_modified_gmt > localDate;
			})
			.map((doc) => doc.id);

		console.log('updatedIds', updatedIds);
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
			debugger;

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
				await this.fetchRemoteIDs();
				this.lastFetchRemoteIDsTime = new Date().getTime();
			}

			return this.storeDB.collections.sync
				.find({ selector: { endpoint: this.endpoint } })
				.exec()
				.then((docs) => docs.map((doc) => doc.get('id')));
		} catch (error) {
			this.errorSubject.next(error);
		}
	}

	/**
	 * Makes a request the the endpoint to fetch all remote IDs
	 * - can be overwritten by the fetchRemoteIDs hook, this is required for variations
	 */
	async fetchRemoteState() {
		// if (this.hooks?.fetchRemoteIDs) {
		// 	/**
		// 	 * @HACK - this is a bit hacky, but it works for now
		// 	 * Variations is one collection locally, containing all variations
		// 	 * But it is multiple endpoints on the server, one for each product
		// 	 * Maybe we should have a separate collection for each variable product?
		// 	 */
		// 	return this.hooks?.fetchRemoteIDs(this.endpoint, this.collection);
		// }

		if (this.isStopped() || this.subjects.active.getValue()) {
			return;
		}

		this.subjects.active.next(true);

		try {
			const response = await this.httpClient.get(this.endpoint, {
				params: { fields: ['id', 'date_modified_gmt'], posts_per_page: -1 },
			});

			if (!Array.isArray(response?.data)) {
				throw new Error('Invalid response data for remote IDs');
			}

			const data = response.data.map((doc) => ({ ...doc, endpoint: this.endpoint }));
			const { success, error } = await this.storeDB.collections.sync.bulkUpsert(data);

			if (error.length > 0) {
				throw new Error('Error saving remote state for ' + this.endpoint);
			}

			return success;
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

		const remoteIDs = await this.storeDB.collections.sync
			.find({ selector: { endpoint: this.endpoint } })
			.exec()
			.then((docs) => docs.map((doc) => doc.get('id')))
			.then((ids) => ids.filter((id) => Number.isInteger(id)));

		const localIDs = await this.collection
			.find()
			.exec()
			.then((docs) => docs.map((doc) => doc.get('id')))
			.then((ids) => ids.filter((id) => Number.isInteger(id)));

		return remoteIDs.filter((id) => !localIDs.includes(id));
	}

	async getSyncedRemoteIDs() {
		await this.firstSync;

		const remoteIDs = await this.storeDB.collections.sync
			.find({ selector: { endpoint: this.endpoint } })
			.exec()
			.then((docs) => docs.map((doc) => doc.get('id')))
			.then((ids) => ids.filter((id) => Number.isInteger(id)));

		const localIDs = await this.collection
			.find()
			.exec()
			.then((docs) => docs.map((doc) => doc.get('id')))
			.then((ids) => ids.filter((id) => Number.isInteger(id)));

		return remoteIDs.filter((id) => localIDs.includes(id));
	}

	/**
	 *
	 */
	async getStoredRemoteIDs() {
		const remoteIDs = await this.storeDB.collections.sync
			.find({ selector: { endpoint: this.endpoint } })
			.exec()
			.then((docs) => docs.map((doc) => doc.get('id')))
			.then((ids) => ids.filter((id) => Number.isInteger(id)));

		return remoteIDs;
	}

	/**
	 *
	 */
	async getLocalLastModifiedDate() {}

	/**
	 *
	 */
	async fetchUnsynced() {
		if (this.isStopped() || this.subjects.active.getValue()) {
			return;
		}

		// Limit the number of times we fetch unsynced docs to keep server load down
		if (this.lastFetchUnsyncedTime < new Date().getTime() - this.pollingTime) {
			return;
		}
		this.lastFetchUnsyncedTime = new Date().getTime();

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

			if (!Array.isArray(response?.data)) {
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
				/**
				 * Modified after is always in GMT
				 */
				dates_are_gmt: true,
			},
		});

		return response;
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

			if (!response?.data) {
				throw new Error('Invalid response data for remote patch');
			}

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

			if (!response?.data) {
				throw new Error('Invalid response data for remote create');
			}

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
