import isEmpty from 'lodash/isEmpty';
import { BehaviorSubject, Subject, Observable, Subscription, interval, combineLatest } from 'rxjs';
import { switchMap, filter, distinctUntilChanged, map, startWith } from 'rxjs/operators';

import { DataFetcher } from './data-fetcher';
import { Logger } from './logger';
import { SubscribableBase } from './subscribable-base';
import { SyncStateManager } from './sync-state';

type ProductCollection = import('@wcpos/database').ProductCollection;
type ProductVariationCollection = import('@wcpos/database').ProductVariationCollection;
type ProductCategoryCollection = import('@wcpos/database').ProductCategoryCollection;
type ProductTagCollection = import('@wcpos/database').ProductTagCollection;
type OrderCollection = import('@wcpos/database').OrderCollection;
type CustomerCollection = import('@wcpos/database').CustomerCollection;
type TaxRateCollection = import('@wcpos/database').TaxRateCollection;

type Collection =
	| ProductCollection
	| ProductVariationCollection
	| ProductCategoryCollection
	| ProductTagCollection
	| OrderCollection
	| CustomerCollection
	| TaxRateCollection;

interface CollectionReplicationConfig<Collection> {
	collection: Collection;
	syncCollection: any;
	httpClient: any;
	hooks?: any;
	endpoint: string;
	errorSubject: Subject<Error>;
}

/**
 *
 */
export class CollectionReplicationState<T extends Collection> extends SubscribableBase {
	private dataFetcher: DataFetcher;
	public syncStateManager: SyncStateManager; // used by query replication state
	private logger: Logger;
	private errorSubject: Subject<Error>;
	private collection: T;
	private endpoint: string;

	// Observable state variables
	private lastFetchRemoteState: number | null = null;
	private lastFetchRemoteUpdates: number | null = null;
	private pollingInterval = 1000 * 60 * 5; // 5 minutes
	private fullFetchInterval = 1000 * 60 * 60; // 1 hour
	private firstSyncResolver: (() => void) | null = null;
	public readonly firstSync: Promise<void>;

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

	constructor(config: CollectionReplicationConfig<T>) {
		super();

		if (!config.collection) {
			throw new Error('collection is required');
		}

		this.errorSubject = config.errorSubject;
		this.collection = config.collection;
		this.endpoint = config.endpoint;

		// Initialize components
		this.logger = new Logger({ storeDB: config.collection.database });
		this.dataFetcher = new DataFetcher(config.httpClient, config.endpoint);
		this.syncStateManager = new SyncStateManager({
			syncCollection: config.syncCollection,
			endpoint: config.endpoint,
			logger: this.logger,
			collection: this.collection,
		});

		// Initialize firstSync promise
		this.firstSync = new Promise<void>((resolve) => {
			this.firstSyncResolver = resolve;
		});

		// Initialize subscriptions
		this.setupSubscriptions();
	}

	cancel() {
		this.subjects.total.next(0);
		super.cancel();
	}

	private setupSubscriptions() {
		const polling$ = this.paused$.pipe(
			switchMap((paused) => (paused ? [] : interval(this.pollingInterval).pipe(startWith(0)))),
			filter(() => !this.subjects.paused.getValue())
		);

		this.addSub(
			'polling',
			polling$.subscribe(() => {
				this.run();
			})
		);

		const remoteCount$ = this.syncStateManager.syncCollection
			.count({
				selector: {
					endpoint: { $eq: this.endpoint },
					id: { $exists: true },
				},
			})
			.$.pipe(distinctUntilChanged());

		const newLocalCount$ = this.collection
			.count({
				selector: {
					id: { $exists: false },
				},
			})
			.$.pipe(distinctUntilChanged());

		const totalCount$ = combineLatest([remoteCount$, newLocalCount$]).pipe(
			map(([remoteCount, newLocalCount]) => {
				return remoteCount + newLocalCount;
			}),
			startWith(0)
		);

		// Subscribe to the total count and update the subject
		this.addSub(
			'total',
			totalCount$.subscribe((count) => {
				this.subjects.total.next(count);
			})
		);
	}

	async run({ force = false }: { force?: boolean } = {}) {
		if (force) {
			this.resetFetchTimes();
		}

		if (this.subjects.paused.getValue() && force) {
			this.start();
		}

		if (this.shouldFetchRemoteState()) {
			await this.fetchAndAuditRemoteState();
		} else if (this.shouldFetchRemoteUpdates()) {
			await this.fetchAndAuditRemoteUpdates();
		}
	}

	private resetFetchTimes() {
		this.lastFetchRemoteState = null;
		this.lastFetchRemoteUpdates = null;
	}

	private shouldFetchRemoteState() {
		const now = Date.now();
		return !this.lastFetchRemoteState || this.lastFetchRemoteState < now - this.fullFetchInterval;
	}

	private shouldFetchRemoteUpdates() {
		const now = Date.now();
		return !this.lastFetchRemoteUpdates || this.lastFetchRemoteUpdates < now - this.pollingInterval;
	}

	private async fetchAndAuditRemoteState() {
		this.lastFetchRemoteState = Date.now();
		this.lastFetchRemoteUpdates = this.lastFetchRemoteState;
		this.subjects.active.next(true);

		try {
			const response = await this.dataFetcher.fetchAllRemoteIds();
			if (!Array.isArray(response?.data)) {
				await this.logger.logInvalidResponse('Invalid response fetching remote state');
				return;
			}

			await this.logger.logFetchStatus(this.dataFetcher.endpoint, response.headers, 'all');
			await this.syncStateManager.processFullAudit(response.data);
			this.subjects.active.next(false);
			await this.syncStateManager.removeStaleRecords();
			await this.update();
		} catch (error) {
			this.errorSubject.next(error);
		} finally {
			this.subjects.active.next(false);

			if (this.firstSyncResolver) {
				this.firstSyncResolver();
				this.firstSyncResolver = null;
			}
		}
	}

	private async fetchAndAuditRemoteUpdates() {
		if (this.lastFetchRemoteUpdates) {
			const modifiedAfter = new Date(this.lastFetchRemoteUpdates).toISOString().slice(0, 19);
			this.lastFetchRemoteUpdates = Date.now();
			this.subjects.active.next(true);

			try {
				const response = await this.dataFetcher.fetchRecentRemoteUpdates(modifiedAfter);
				if (!Array.isArray(response?.data)) {
					await this.logger.logInvalidResponse('Invalid response checking updates');
					return;
				}

				await this.logger.logFetchStatus(this.dataFetcher.endpoint, response.headers, 'updates');
				if (!isEmpty(response.data)) {
					await this.syncStateManager.processModifiedAfter(response.data);
				}
				this.subjects.active.next(false);
				await this.update();
			} catch (error) {
				this.errorSubject.next(error);
			} finally {
				this.subjects.active.next(false);
			}
		} else {
			this.lastFetchRemoteUpdates = Date.now();
		}
	}

	async update() {
		const ids = await this.syncStateManager.getUpdatedRemoteIDs();

		if (ids.length > 0) {
			await this.sync({ include: ids, force: true });
		} else {
			await this.sync();
		}
	}

	async sync({
		include,
		force,
		greedy,
	}: { include?: number[]; force?: boolean; greedy?: boolean } = {}) {
		if (!force && (this.subjects.paused.getValue() || this.subjects.active.getValue())) {
			return;
		}

		const specificIncludes = !!include;
		let exclude: number[] | undefined;

		if (!include) {
			include = await this.syncStateManager.getUnsyncedRemoteIDs();
		}

		if (include.length === 0) {
			return;
		}

		if (!specificIncludes) {
			exclude = await this.syncStateManager.getSyncedRemoteIDs();
		}

		this.subjects.active.next(true);
		const params = {};

		/**
		 * @FIXME - this is a hack for the products endpoint, the general fetchRemoteByIDs should
		 * only be for status = 'published'.
		 *
		 * I also should have defauly sort params for each collection
		 */
		if (this.endpoint === 'products' || this.endpoint === 'products/variations') {
			params.status = 'publish';
		}

		try {
			let response;
			if (exclude && exclude.length < include.length) {
				response = await this.dataFetcher.fetchRemoteByIDs({ exclude }, params);
			} else {
				response = await this.dataFetcher.fetchRemoteByIDs({ include }, params);
			}
			await this.bulkUpsertResponse(response);
		} catch (error) {
			this.errorSubject.next(error);
		} finally {
			this.subjects.active.next(false);
		}
	}

	/**
	 * This is used by the Query Replication State also
	 */
	public async bulkUpsertResponse(response: any) {
		try {
			if (!Array.isArray(response?.data)) {
				await this.logger.logInvalidResponse('Invalid response from server');
				return;
			}

			const documents = response.data.map((doc: any) => this.collection.parseRestResponse(doc));
			if (documents.length === 0) {
				return;
			}

			await this.syncStateManager.processServerResponse(documents);
		} catch (error) {
			this.errorSubject.next(error);
		}
	}

	start() {
		this.subjects.paused.next(false);
	}

	pause() {
		this.subjects.paused.next(true);
	}

	/**
	 * ------------------------------
	 * Remote Mutations
	 * @TODO - these should be done with flags in the sync collection
	 * ------------------------------
	 */
	remotePatch = async (doc, data) => {
		try {
			if (!doc.id) {
				throw new Error('document does not have an id');
			}

			// @TODO - I should use the link property to get the endpoint
			const response = await this.dataFetcher.remotePatch(doc, data);

			if (!response?.data) {
				throw new Error('Invalid response data for remote patch');
			}

			const parsedData = this.collection.parseRestResponse(response.data);
			const result = await this.syncStateManager.processServerResponse([parsedData]);
			if (result?.success.length === 1) {
				return result.success[0];
			}
		} catch (error) {
			this.errorSubject.next(error);
		}
	};

	remoteCreate = async (data) => {
		try {
			const response = await this.dataFetcher.remoteCreate(data);

			if (!response?.data) {
				throw new Error('Invalid response data for remote create');
			}

			const parsedData = this.collection.parseRestResponse(response.data);
			const result = await this.syncStateManager.processServerResponse([parsedData]);
			if (result?.success.length === 1) {
				return result.success[0];
			}
		} catch (error) {
			this.errorSubject.next(error);
		}
	};
}
