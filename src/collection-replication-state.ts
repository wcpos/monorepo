import isEmpty from 'lodash/isEmpty';
import { BehaviorSubject, Subject, Observable, Subscription, interval, combineLatest } from 'rxjs';
import { switchMap, filter, distinctUntilChanged, map, startWith } from 'rxjs/operators';

import { DataFetcher } from './data-fetcher';
import { DataProcessor } from './data-processor';
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
	private dataProcessor: DataProcessor;
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

	constructor(config: CollectionReplicationConfig<T>) {
		super();
		this.errorSubject = config.errorSubject;
		this.collection = config.collection;
		this.endpoint = config.endpoint;

		// Initialize components
		this.logger = new Logger(config.collection.database);
		this.dataFetcher = new DataFetcher(config.httpClient, config.endpoint);
		this.syncStateManager = new SyncStateManager(config.syncCollection, config.endpoint);
		this.dataProcessor = new DataProcessor(config.collection, this.logger);

		// Initialize firstSync promise
		this.firstSync = new Promise<void>((resolve) => {
			this.firstSyncResolver = resolve;
		});

		// Initialize subscriptions
		this.setupSubscriptions();
	}

	private setupSubscriptions() {
		const polling$ = this.paused$.pipe(
			switchMap((paused) => (paused ? [] : interval(this.pollingInterval).pipe(startWith(0)))),
			filter(() => !this.subjects.paused.getValue())
		);

		this.subs.push(
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
					id: { $eq: null },
				},
			})
			.$.pipe(distinctUntilChanged());

		const totalCount$ = combineLatest([remoteCount$, newLocalCount$]).pipe(
			map(([remoteCount, newLocalCount]) => remoteCount + newLocalCount),
			startWith(0)
		);

		// Subscribe to the total count and update the subject
		this.subs.push(totalCount$.subscribe((count) => this.subjects.total.next(count)));
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
			await this.handleSyncState(response.data, 'all');
			this.subjects.active.next(false); // Network request is done, allow updates request
			await this.remove();
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
					await this.handleSyncState(response.data, 'updates');
				}
			} catch (error) {
				this.errorSubject.next(error);
			} finally {
				this.subjects.active.next(false);
			}
		} else {
			this.lastFetchRemoteUpdates = Date.now();
		}
	}

	private async handleSyncState(data: any[], type: string) {
		const remoteDataMap = new Map(data.map((doc) => [doc.id, doc]));
		const syncDataMap = await this.syncStateManager.getMappedSyncedStateRecords();
		const newRecords = [];

		for (const [id, remoteDoc] of remoteDataMap.entries()) {
			if (!syncDataMap.has(id)) {
				newRecords.push({
					...remoteDoc,
					endpoint: this.dataFetcher.endpoint,
					status: 'PULL_NEW',
				});
				remoteDataMap.delete(id);
			}
		}

		if (newRecords.length > 0) {
			await this.syncStateManager.insertNewSyncRecords(newRecords);
		}

		if (remoteDataMap.size > 0) {
			if (type === 'updates') {
				await this.processUpdates(remoteDataMap);
			} else {
				await this.processFullSync(remoteDataMap);
			}
		}
	}

	private async processFullSync(remoteDataMap: Map<string, any>) {
		const batchSize = 1000;
		let skip = 0;
		let hasMore = true;

		while (hasMore) {
			const localData = await this.collection
				.find({
					selector: { id: { $exists: true } },
					skip,
					limit: batchSize,
					sort: [{ id: 'asc' }],
				})
				.exec();

			if (localData.length === 0) {
				hasMore = false;
				continue;
			}

			const updates: any[] = [];

			for (const localDoc of localData) {
				const remoteDoc = remoteDataMap.get(localDoc.id);
				if (!remoteDoc) {
					updates.push({
						id: localDoc.id,
						endpoint: this.endpoint,
						status: 'PULL_DELETE',
					});
				} else if (remoteDoc.date_modified_gmt > localDoc.date_modified_gmt) {
					updates.push({
						id: localDoc.id,
						endpoint: this.endpoint,
						status: 'PULL_UPDATE',
					});
				} else if (remoteDoc.date_modified_gmt < localDoc.date_modified_gmt) {
					updates.push({
						id: localDoc.id,
						endpoint: this.endpoint,
						status: 'PUSH_UPDATE_DEFERRED',
					});
				} else {
					updates.push({
						id: localDoc.id,
						endpoint: this.endpoint,
						status: 'SYNCED',
					});
				}
			}

			await this.syncStateManager.updateSyncState(updates);
			skip += batchSize;
		}
	}

	private async processUpdates(remoteDataMap: Map<string, any>) {
		const localIDs = Array.from(remoteDataMap.keys());
		const localDocs = await this.collection.findByIds(localIDs).exec();

		const updates: any[] = [];

		for (const id of localIDs) {
			const localDoc = localDocs.get(id);
			const remoteDoc = remoteDataMap.get(id);

			if (!localDoc) {
				// Document does not exist locally
				updates.push({
					id,
					endpoint: this.endpoint,
					status: 'PULL_NEW',
				});
			} else if (remoteDoc.date_modified_gmt > localDoc.date_modified_gmt) {
				updates.push({
					id,
					endpoint: this.endpoint,
					status: 'PULL_UPDATE',
				});
			} else if (remoteDoc.date_modified_gmt < localDoc.date_modified_gmt) {
				updates.push({
					id,
					endpoint: this.endpoint,
					status: 'PUSH_UPDATE_DEFERRED',
				});
			} else {
				updates.push({
					id,
					endpoint: this.endpoint,
					status: 'SYNCED',
				});
			}
		}

		await this.syncStateManager.updateSyncState(updates);
	}

	async remove() {
		const docsToRemove = await this.syncStateManager.getRecordsForRemoval();

		if (docsToRemove.length > 0) {
			const ids = docsToRemove.map((doc: any) => doc.id);
			await this.dataProcessor.removeDocumentsByIds(ids);
			await this.syncStateManager.syncCollection.bulkRemove(
				docsToRemove.map((doc: any) => doc.syncId)
			);
		}
	}

	async update() {
		const ids = await this.syncStateManager.getStaleIDs();

		if (ids.length > 0) {
			await this.sync({ include: ids, force: true });
		} else {
			await this.sync();
		}
	}

	async sync({ include, force }: { include?: number[]; force?: boolean } = {}) {
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

		try {
			let response;
			if (exclude && exclude.length < include.length) {
				response = await this.dataFetcher.fetchRemoteByIDs({ exclude });
			} else {
				response = await this.dataFetcher.fetchRemoteByIDs({ include });
			}
			await this.bulkUpsertResponse(response);
		} catch (error) {
			this.errorSubject.next(error);
		} finally {
			this.subjects.active.next(false);
		}
	}

	private async bulkUpsertResponse(response: any) {
		try {
			if (!Array.isArray(response?.data)) {
				await this.logger.logInvalidResponse('Invalid response from server');
				return;
			}

			const documents = response.data.map((doc: any) => this.collection.parseRestResponse(doc));
			if (documents.length === 0) {
				return;
			}

			const primaryPath = this.collection.schema.primaryPath;
			const ids = documents.map((doc: any) => doc[primaryPath]);
			const localDocs = await this.collection.findByIds(ids).exec();

			if (localDocs.size === 0) {
				await this.dataProcessor.insertNewDocuments(documents);
			} else {
				await this.dataProcessor.updateExistingDocuments(documents, localDocs);
			}

			// Update sync state to 'SYNCED'
			const updates = documents.map((doc: any) => ({
				id: doc.id,
				endpoint: this.endpoint,
				status: 'SYNCED',
			}));
			await this.syncStateManager.updateSyncState(updates);
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
			// await this.collection.upsertRefs(parsedData); // upsertRefs mutates the parsedData
			await doc.incrementalPatch(parsedData);
			return doc;
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
			// await this.collection.upsertRefs(parsedData); // upsertRefs mutates the parsedData
			const doc = await this.collection.upsert(parsedData);
			return doc;
		} catch (error) {
			this.errorSubject.next(error);
		}
	};
}
