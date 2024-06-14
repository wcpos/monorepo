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
import log from '@wcpos/utils/src/logger';

import { SubscribableBase } from './subscribable-base';

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

export interface QueryHooks {
	preEndpoint?: (collection: Collection) => string;
}

interface CollectionReplicationConfig<Collection> {
	collection: Collection;
	syncCollection: any;
	httpClient: any;
	hooks?: any;
	endpoint: string;
	errorSubject: Subject<Error>;
}

export class CollectionReplicationState<T extends Collection> extends SubscribableBase {
	private hooks: CollectionReplicationConfig<T>['hooks'];
	public readonly endpoint: string;
	public readonly collection: T;
	public readonly syncCollection: any;
	public readonly storeDB: StoreDatabase;
	public readonly httpClient: any;
	private errorSubject: Subject<Error>;

	/**
	 * Internal State
	 */
	private lastFetchRemoteState = null;
	private lastFetchRemoteUpdates = null;
	private pollingInterval = 1000 * 60 * 5; // 5 minutes
	private fullFetchInterval = 1000 * 60 * 60; // 1 hour
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
	 * @TODO - I need a better pause/resume system which can pause mid process, then resume
	 * This is a hack for now to allow the query sync to pause the collection sync
	 */
	private querySync: Promise<void> = Promise.resolve();
	public setQuerySyncPromise = (promise: Promise<void>) => {
		this.querySync = promise;
	};

	/**
	 *
	 */
	constructor({
		collection,
		syncCollection,
		httpClient,
		hooks,
		endpoint,
		errorSubject,
	}: CollectionReplicationConfig<T>) {
		super();
		this.collection = collection;
		this.syncCollection = syncCollection;
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
		this.setupDocumentCount();
		this.setupPolling();
	}

	/**
	 * Subscribe to remote and local collections to calculate the total number of documents
	 */
	private setupDocumentCount() {
		const remoteCount$ = this.syncCollection
			.count({ selector: { endpoint: this.endpoint, id: { $exists: true } } })
			.$.pipe(distinctUntilChanged());

		const newLocalCount$ = this.collection
			.count({ selector: { id: { $eq: null } } })
			.$.pipe(distinctUntilChanged());

		const totalCount$ = combineLatest([remoteCount$, newLocalCount$]).pipe(
			map(([remoteCount, newLocalCount]) => remoteCount + newLocalCount),
			startWith(0)
		);

		// Subscribe to the total count and update the subject
		this.subs.push(totalCount$.subscribe((count) => this.subjects.total.next(count)));
	}

	/**
	 * Set up a polling interval to run the replication
	 */
	private setupPolling() {
		const polling$ = this.paused$.pipe(
			switchMap((isPaused) => (isPaused ? [] : interval(this.pollingTime).pipe(startWith(0)))),
			filter(() => !this.subjects.paused.getValue())
		);

		this.subs.push(
			polling$.subscribe(async () => {
				this.run();
			})
		);
	}

	/**
	 * Run the collection replication
	 */
	run = async ({ force }: { force?: boolean } = {}) => {
		if (force) {
			this.resetFetchTimes();
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
		if (this.shouldFetchRemoteState()) {
			await this.fetchAndAuditRemoteState();
		} else if (this.shouldFetchRemoteUpdates()) {
			await this.fetchAndAuditRemoteUpdates();
		}
	};

	private resetFetchTimes = () => {
		this.lastFetchRemoteState = null;
		this.lastFetchRemoteUpdates = null;
	};

	private shouldFetchRemoteState = (): boolean => {
		const now = Date.now();
		return this.lastFetchRemoteState < now - this.fullFetchInterval;
	};

	private shouldFetchRemoteUpdates = (): boolean => {
		const now = Date.now();
		return this.lastFetchRemoteUpdates < now - this.pollingInterval;
	};

	private fetchAndAuditRemoteState = async () => {
		this.lastFetchRemoteState = Date.now();
		this.lastFetchRemoteUpdates = this.lastFetchRemoteState;
		await this.fetchAllRemoteIds();
		await this.audit();
	};

	private fetchAndAuditRemoteUpdates = async () => {
		this.lastFetchRemoteUpdates = Date.now();
		await this.fetchRecentRemoteUpdates();
		await this.audit();
	};

	/**
	 *
	 */
	async audit() {
		const remove = await this.syncCollection
			.find({ selector: { status: 'PULL_DELETE', endpoint: this.endpoint, id: { $exists: true } } })
			.exec()
			.then((docs) => docs.map((doc) => doc.id));

		if (remove.length > 0 && this.collection.name !== 'variations') {
			// deletion should be rare, only when an item is deleted from the server
			log.warn('removing', remove, 'from', this.collection.name);
			await this.storeDB.collections.logs.insert({
				level: 'warn',
				timestamp: Date.now(),
				message: 'Removing records from ' + this.collection.name,
				context: remove,
			});
			await this.collection.find({ selector: { id: { $in: remove } } }).remove();
		}

		const updated = await this.syncCollection
			.find({ selector: { status: 'PULL_UPDATE', endpoint: this.endpoint, id: { $exists: true } } })
			.exec()
			.then((docs) => docs.map((doc) => doc.id));

		// If there are updated records, sync them, else get any unsynced records
		if (updated.length > 0) {
			await this.sync({ include: updated, force: true });
		} else {
			await this.sync();
		}
	}

	/**
	 * Makes a request the the endpoint to fetch all remote IDs
	 * - this should be done as rarely as possible, getting all remote IDs is expensive on the server
	 */
	fetchAllRemoteIds = async () => {
		if (this.isStopped() || this.subjects.active.getValue()) {
			return;
		}

		this.subjects.active.next(true);

		try {
			const response = await this.httpClient.get(this.endpoint, {
				params: { fields: ['id', 'date_modified_gmt'], posts_per_page: -1 },
			});

			if (!Array.isArray(response?.data)) {
				this.logInvalidResponse('Invalid response fetching remote state for ' + this.endpoint);
				return;
			}

			this.logFetchStatus(this.endpoint, response.headers, 'all');

			/**
			 * Save the remote state to the sync collection
			 * - compare to existing sync collection, insert or update as needed
			 */
			const remoteDataMap = new Map(response.data.map((doc) => [doc.id, doc]));
			const syncData = await this.syncCollection
				.find({ selector: { endpoint: this.endpoint } })
				.exec();
			const syncDataMap = new Map(syncData.map((doc) => [doc.id, doc]));

			// make sure we wait for the sync state to be updated before resolving the firstSync
			await this.handleSyncState(remoteDataMap, syncDataMap, this.endpoint, 'all');

			// Resolve the firstSync promise
			if (this.firstSyncResolver) {
				this.firstSyncResolver();
				this.firstSyncResolver = null; // Clear the resolver to prevent future calls
			}
		} catch (error) {
			this.errorSubject.next(error);
		} finally {
			this.subjects.active.next(false);
		}
	};

	/**
	 *
	 */
	fetchRecentRemoteUpdates = async () => {
		if (this.isStopped() || this.subjects.active.getValue()) {
			return;
		}

		this.subjects.active.next(true);

		try {
			if (!this.lastFetchRemoteUpdates) {
				return;
			}

			const modified_after = new Date(this.lastFetchRemoteUpdates).toISOString().slice(0, 19);
			const response = await this.httpClient.get(this.endpoint, {
				params: {
					fields: ['id', 'date_modified_gmt'],
					posts_per_page: -1,
					modified_after,
				},
			});

			if (!Array.isArray(response?.data)) {
				this.logInvalidResponse('Invalid response checking updates for ' + this.endpoint);
				return;
			}

			this.logFetchStatus(this.endpoint, response.headers, 'updates');

			/**
			 * Save the remote state to the sync collection
			 * - compare to existing sync collection, insert or update as needed
			 */
			const remoteDataMap = new Map(response.data.map((doc) => [doc.id, doc]));
			const syncData = await this.syncCollection
				.find({ selector: { endpoint: this.endpoint } })
				.exec();
			const syncDataMap = new Map(syncData.map((doc) => [doc.id, doc]));

			await this.handleSyncState(remoteDataMap, syncDataMap, this.endpoint, 'updates');
		} catch (error) {
			this.errorSubject.next(error);
		} finally {
			this.subjects.active.next(false);
		}
	};

	/**
	 *
	 */
	async getUnsyncedRemoteIDs() {
		await this.firstSync;
		const unsyncedRemoteIDs = await this.syncCollection
			.find({
				selector: {
					status: 'PULL_NEW',
					endpoint: this.endpoint,
					id: { $exists: true },
				},
			})
			.exec()
			.then((docs) => docs.map((doc) => doc.id));

		return unsyncedRemoteIDs;
	}

	/**
	 * Synced in this case can mean anything not PULL_NEW, eg: PUSH_UPDATE_DEFERRED is synced
	 * This list of ids is used to exclude items from a server fetch
	 */
	async getSyncedRemoteIDs() {
		await this.firstSync;
		const syncedRemoteIDs = await this.syncCollection
			.find({
				selector: {
					status: { $ne: 'PULL_NEW' },
					endpoint: this.endpoint,
					id: { $exists: true },
				},
			})
			.exec()
			.then((docs) => docs.map((doc) => doc.id));

		return syncedRemoteIDs;
	}

	// /**
	//  *
	//  */
	// async getStoredRemoteDocs() {
	// 	return this.syncCollection
	// 		.find({
	// 			selector: {
	// 				endpoint: this.endpoint,
	// 				id: { $exists: true },
	// 			},
	// 		})
	// 		.exec();
	// }

	// /**
	//  *
	//  */
	// async getLocalDocs() {
	// 	return this.collection.find().exec();
	// }
	//
	// /**
	//  *
	//  */
	// async getStoredRemoteIDs() {
	// 	return this.getStoredRemoteDocs()
	// 		.then((docs) => docs.map((doc) => doc.get('id')))
	// 		.then((ids) => ids.filter((id) => Number.isInteger(id)));
	// }

	// /**
	//  *
	//  */
	// async getLocalIDs() {
	// 	return this.getLocalDocs()
	// 		.then((docs) => docs.map((doc) => doc.get('id')))
	// 		.then((ids) => ids.filter((id) => Number.isInteger(id)));
	// }

	/**
	 * @TODO - if there is include less than 10, it might be nice to check for any unsynced
	 * and include those as well.
	 */
	async sync({
		include,
		greedy,
		force,
	}: { include?: number[]; greedy?: boolean; force?: boolean } = {}) {
		if (!force && (this.isStopped() || this.subjects.active.getValue())) {
			return;
		}
		const specificIncludes = !!include;
		let exclude;

		// Wait for the query replication to complete first if it's active
		// @TODO - create a better pause/resume system
		await this.querySync;

		if (!include) {
			include = await this.getUnsyncedRemoteIDs();
		}

		// If there are no unsynced or updated remote IDs, we can skip the fetch.
		if (include.length === 0) {
			return;
		}

		// If includes weren't passed, we should check whether excludes are shorter
		if (!specificIncludes) {
			exclude = await this.getSyncedRemoteIDs();
		}

		this.subjects.active.next(true);

		try {
			let response;
			if (exclude && exclude.length < include.length) {
				response = await this.fetchRemoteByIDs({ exclude });
			} else {
				response = await this.fetchRemoteByIDs({ include });
			}
			await this.bulkUpsertResponse(response);
		} catch (error) {
			this.errorSubject.next(error);
		} finally {
			this.subjects.active.next(false);
		}
	}

	/**
	 *
	 */
	async bulkUpsertResponse(response) {
		try {
			if (!Array.isArray(response?.data)) {
				this.logInvalidResponse('Invalid response from server for ' + this.endpoint);
				return;
			}
			const documents = response.data.map((doc) => this.collection.parseRestResponse(doc));
			if (documents.length === 0) {
				return;
			}

			const primaryPath = this.collection.schema.primaryPath;
			const ids = documents.map((doc) => doc[primaryPath]);
			const localDocs = await this.collection.findByIds(ids).exec();

			/**
			 * Insert docs that are not in the local collection
			 */
			if (localDocs.size === 0) {
				await this.insertNewDocuments(documents);
			} else {
				await this.updateExistingDocuments(documents, localDocs);
			}
		} catch (error) {
			this.errorSubject.next(error);
		} finally {
			this.subjects.active.next(false);
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

	/**
	 * ------------------------------
	 * Fetch methods
	 * ------------------------------
	 */
	async fetchRemoteByIDs({ include = undefined, exclude = undefined }) {
		const response = await this.httpClient.post(
			this.endpoint,
			{
				include,
				exclude,
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
	 * ------------------------------
	 * Collection insert/update methods
	 * ------------------------------
	 */
	private insertNewDocuments = async (documents) => {
		let updateSync = [];
		const result = await this.collection.bulkInsert(documents);

		if (result?.success?.length > 0) {
			this.logAddedDocuments(result.success.map((doc) => doc.id));
		}

		updateSync = documents.map((doc) => ({
			id: doc.id,
			endpoint: this.endpoint,
			status: 'SYNCED',
		}));

		await this.batchBulkUpsertSyncState(updateSync);
	};

	private updateExistingDocuments = async (documents, localDocs) => {
		let updateSync = [];
		const updatedDocs = documents.filter((doc) => {
			const localDoc = localDocs.get(doc[this.collection.schema.primaryPath]);
			return localDoc && localDoc.date_modified_gmt < doc.date_modified_gmt;
		});

		if (updatedDocs.length > 0) {
			const result = await this.collection.bulkUpsert(updatedDocs);

			if (result?.success?.length > 0) {
				this.logUpdatedDocuments(result.success.map((doc) => doc.id));
			}

			updateSync = updatedDocs.map((doc) => ({
				id: doc.id,
				endpoint: this.endpoint,
				status: 'SYNCED',
			}));

			await this.batchBulkUpsertSyncState(updateSync);
		}
	};

	/**
	 * ------------------------------
	 * Sync state handlers
	 * ------------------------------
	 */
	private handleSyncState = async (
		remoteDataMap: Map<string, any>,
		syncDataMap: Map<string, any>,
		endpoint: string,
		type: 'updates'
	) => {
		const newRecords = [];
		const removeRecords = [];

		// Collect syncIds for ids in syncDataMap that are not in remoteDataMap
		if (type !== 'updates') {
			for (const [id, record] of Array.from(syncDataMap.entries())) {
				if (!remoteDataMap.has(id)) {
					removeRecords.push(record.syncId);
					syncDataMap.delete(id);
				}
			}

			if (removeRecords.length > 0) {
				await this.syncCollection.bulkRemove(removeRecords);
			}
		}

		// Check for records in remoteDataMap that are not in syncDataMap
		for (const id of Array.from(remoteDataMap.keys())) {
			if (!syncDataMap.has(id)) {
				newRecords.push({
					...remoteDataMap.get(id),
					endpoint,
					status: 'PULL_NEW',
				});
				remoteDataMap.delete(id);
			}
		}

		if (newRecords.length > 0) {
			await this.batchBulkInsertSyncState(newRecords);
		}

		/**
		 * If we're processing updates, we only need to check against the local IDs
		 */
		if (remoteDataMap.size > 0) {
			const localIDs = type === 'updates' ? Array.from(syncDataMap.keys()) : null;
			await this.batchProcessSyncState(remoteDataMap, localIDs);
		}
	};

	/**
	 *
	 */
	batchBulkInsertSyncState = (docsData, batchSize = 1000) => {
		return new Promise((resolve, reject) => {
			const results = {
				success: [],
				error: [],
			};

			const processBatch = (index) => {
				if (index >= docsData.length) {
					resolve(results);
					return;
				}

				const batch = docsData.slice(index, index + batchSize);
				this.syncCollection
					.bulkInsert(batch)
					.then((result) => {
						results.success.push(...result.success);
						results.error.push(...result.error);

						if (results.error.length > 0) {
							log.error('Error saving remote state for ' + this.endpoint, results.error);
							reject(new Error('Error saving remote state for ' + this.endpoint));
							return;
						}

						setTimeout(() => processBatch(index + batchSize), 0);
					})
					.catch((err) => {
						log.error('Error during bulk insert', err);
						reject(err);
					});
			};

			setTimeout(() => processBatch(0), 0);
		});
	};

	/**
	 *
	 */
	batchBulkUpsertSyncState = (docsData, batchSize = 1000) => {
		return new Promise((resolve, reject) => {
			const results = {
				success: [],
				error: [],
			};

			const processBatch = (index) => {
				if (index >= docsData.length) {
					resolve(results);
					return;
				}

				const batch = docsData.slice(index, index + batchSize);
				this.syncCollection
					.bulkUpsert(batch)
					.then((result) => {
						results.success.push(...result.success);
						results.error.push(...result.error);

						if (results.error.length > 0) {
							log.error('Error saving remote state for ' + this.endpoint, results.error);
							reject(new Error('Error saving remote state for ' + this.endpoint));
							return;
						}

						setTimeout(() => processBatch(index + batchSize), 0);
					})
					.catch((err) => {
						log.error('Error during bulk upsert', err);
						reject(err);
					});
			};

			setTimeout(() => processBatch(0), 0);
		});
	};

	/**
	 * Batch upsert function to handle existing data and compare local and remote records
	 */
	batchProcessSyncState = async (
		remoteDataMap: Map<string, unknown>,
		localIDs = [],
		batchSize = 1000
	) => {
		// Helper function to get local data in batches
		const fetchLocalDataInBatches = async (skip, limit) => {
			return this.collection
				.find({
					selector: { id: isEmpty(localIDs) ? { $exists: true } : { $in: localIDs } },
					skip,
					limit,
					// sort: [{ id: 'asc' }],
				})
				.exec();
		};

		// Function to process each batch
		const processBatch = async (batchIndex) => {
			const localData = await fetchLocalDataInBatches(batchIndex * batchSize, batchSize);

			if (localData.length === 0) {
				// All batches processed
				return;
			}

			const updates = [];

			// Compare local and remote data
			localData.forEach((localDoc) => {
				if (!localDoc.id) {
					return;
				}

				const remoteDoc = remoteDataMap.get(localDoc.id);

				if (!remoteDoc) {
					// No matching remote record, it has been deleted on the server
					updates.push({
						id: localDoc.id,
						endpoint: this.endpoint,
						status: 'PULL_DELETE',
					});
				} else if (remoteDoc.date_modified_gmt > localDoc.date_modified_gmt) {
					// Remote record has a newer modification date
					updates.push({
						id: localDoc.id,
						endpoint: this.endpoint,
						status: 'PULL_UPDATE',
					});
				} else if (remoteDoc.date_modified_gmt < localDoc.date_modified_gmt) {
					// Local record has a newer modification date
					updates.push({
						id: localDoc.id,
						endpoint: this.endpoint,
						status: 'PUSH_UPDATE_DEFERRED',
					});
				} else if (remoteDoc.date_modified_gmt === localDoc.date_modified_gmt) {
					// Records are synced
					updates.push({
						id: localDoc.id,
						endpoint: this.endpoint,
						status: 'SYNCED',
					});
				}

				// Remove processed remoteDoc from map
				// remoteDataMap.delete(localDoc.id);
			});

			// Insert/Update the processed batch
			this.batchBulkUpsertSyncState(updates);

			// Process next batch
			setTimeout(() => processBatch(batchIndex + 1), 0);
		};

		// Start processing the first batch
		setTimeout(() => processBatch(0), 0);
	};

	/**
	 * ------------------------------
	 * Log helpers
	 * ------------------------------
	 */
	private logInvalidResponse = async (message: string) => {
		return this.storeDB.collections.logs.insert({
			level: 'error',
			timestamp: Date.now(),
			message,
			context: {
				message: 'See console for more details',
			},
		});
	};

	private logFetchStatus = async (endpoint: string, headers: any, type) => {
		const message = type === 'updates' ? 'Checked for updated' : 'Fetched all IDs for';

		return this.storeDB.collections.logs.insert({
			timestamp: Date.now(),
			message: `${message} ${endpoint}`,
			context: {
				total: headers?.['x-wp-total'] ?? 'unknown',
				execution_time: headers?.['x-execution-time'] ?? 'unknown',
				server_load: headers?.['x-server-load'] ?? 'unknown',
			},
		});
	};

	private logAddedDocuments = async (ids) => {
		return this.storeDB.collections.logs.insert({
			timestamp: Date.now(),
			message: 'Synced new ' + this.endpoint,
			context: {
				ids,
			},
		});
	};

	private logUpdatedDocuments = async (ids) => {
		return this.storeDB.collections.logs.insert({
			timestamp: Date.now(),
			message: 'Synced updated ' + this.endpoint,
			context: {
				ids,
			},
		});
	};

	/**
	 * ------------------------------
	 * Remote Mutations
	 * @TODO - these should be done with flags in the sync collection
	 * ------------------------------
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
			// await this.collection.upsertRefs(parsedData); // upsertRefs mutates the parsedData
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
			// await this.collection.upsertRefs(parsedData); // upsertRefs mutates the parsedData
			const doc = await this.collection.upsert(parsedData);
			return doc;
		} catch (error) {
			this.errorSubject.next(error);
		}
	}
}
