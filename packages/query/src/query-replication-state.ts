import { isCancel } from 'axios';
import intersection from 'lodash/intersection';
import isEmpty from 'lodash/isEmpty';
import { BehaviorSubject, interval, Observable } from 'rxjs';
import { filter, startWith, switchMap } from 'rxjs/operators';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { DataFetcher } from './data-fetcher';
import { SubscribableBase } from './subscribable-base';
import { getParamValueFromEndpoint } from './utils';

import type { CollectionReplicationState } from './collection-replication-state';
import type { RxCollection } from 'rxdb';

const syncLogger = getLogger(['wcpos', 'sync', 'query']);

/**
 * Check if an error is a CanceledError (from axios or auth flow).
 * CanceledError means authentication is being handled - don't show error toast.
 */
function isAuthCancelError(error: any): boolean {
	return (
		isCancel(error) ||
		error?.name === 'CanceledError' ||
		error?.code === 'ERR_CANCELED' ||
		error?.message?.includes('attempting re-authentication')
	);
}

interface QueryReplicationConfig<T extends RxCollection> {
	collection: T;
	httpClient: any;
	collectionReplication: CollectionReplicationState<T>;
	hooks?: any;
	endpoint: string;
	greedy?: boolean;
}

export class QueryReplicationState<T extends RxCollection> extends SubscribableBase {
	public readonly pollingTime = 1000 * 60 * 5; // 5 minutes
	public readonly collection: T;
	public readonly httpClient: any;
	public readonly endpoint: any;
	public readonly collectionReplication: CollectionReplicationState<T>;
	public syncCompleted = false;
	public readonly greedy;
	private dataFetcher: DataFetcher;

	/**
	 *
	 */
	public readonly subjects = {
		paused: new BehaviorSubject<boolean>(true), // true when the replication is paused, start true
		active: new BehaviorSubject<boolean>(false), // true when something is running, false when not
	};

	/**
	 *
	 */
	public readonly paused$: Observable<boolean> = this.subjects.paused.asObservable();
	public readonly active$: Observable<boolean> = this.subjects.active.asObservable();

	/**
	 *
	 */
	constructor(config: QueryReplicationConfig<T>) {
		super();

		if (!config.collection) {
			throw new Error('collection is required');
		}

		this.collection = config.collection;
		this.endpoint = config.endpoint;
		this.collectionReplication = config.collectionReplication;
		this.greedy = config.greedy || false;

		// @NOTE: this endpoint is different to the general collection endpoint, it has query params
		this.dataFetcher = new DataFetcher(config.httpClient, config.endpoint);

		// Initialize subscriptions
		this.setupSubscriptions();
	}

	/**
	 * Set up a polling interval to run the replication
	 */
	private setupSubscriptions() {
		const polling$ = this.paused$.pipe(
			switchMap((isPaused) => (isPaused ? [] : interval(this.pollingTime).pipe(startWith(0)))),
			filter(() => !this.subjects.paused.getValue())
		);

		this.addSub(
			'polling',
			polling$.subscribe(() => {
				// Catch any errors to prevent unhandled promise rejections
				this.run().catch(() => {
					// Errors are already logged in run() and its sub-methods
				});
			})
		);
	}

	/**
	 *
	 */
	async run({ force }: { force?: boolean } = {}) {
		if (this.isStopped() && force) {
			this.start();
		}

		await this.collectionReplication.firstSync;
		const saved = await this.sync();

		if (this.greedy && saved && (saved as any[]).length > 0) {
			/**
			 * This is a hack to stop products/variations query from fetching potentially 1000's of documents
			 * We only want the greedy for 'search' in that case
			 */
			if (this.endpoint.startsWith('products/variations') && !this.endpoint.includes('search')) {
				return;
			}

			// Have to be careally careful here, potential infinite loop!!
			this.run();
		}
	}

	/**
	 *
	 */
	async sync() {
		if (this.isStopped() || this.subjects.active.getValue()) {
			return;
		}

		// If query sync is already completed, we go to the collection sync
		if (this.syncCompleted) {
			return this.collectionReplication.sync();
		}

		this.subjects.active.next(true);

		// pause the collection sync while we are syncing the query
		this.collectionReplication.pause();

		let include = await this.collectionReplication.syncStateManager.getUnsyncedRemoteIDs();
		let exclude = await this.collectionReplication.syncStateManager.getSyncedRemoteIDs();
		// const lastModified = this.collectionReplication.getLocalLastModifiedDate();

		/**
		 * Hack: if query has include / exclude, we should override above?
		 * @TODO - query state should init with params object and construct the endpoint id internally
		 */
		const endpointIncludes = getParamValueFromEndpoint(this.endpoint, 'include');
		if (endpointIncludes) {
			const ids = endpointIncludes.split(',').map((id) => parseInt(id, 10));
			include = intersection(include, ids);
		}

		const endpointExcludes = getParamValueFromEndpoint(this.endpoint, 'exclude');
		if (endpointExcludes) {
			const ids = endpointExcludes.split(',').map((id) => parseInt(id, 10));
			exclude = intersection(exclude, ids);
		}

		try {
			let response;

			if (isEmpty(include)) {
				// I think we can remove this now because we have remote date_modified_gmt, so we know what to fetch
				// response = await this.fetchLastModified({ lastModified });
				response = { data: [] };
			} else {
				if (exclude?.length < include?.length) {
					response = await this.dataFetcher.fetchRemoteByIDs({ exclude }, {}, this.signal);
				} else {
					response = await this.dataFetcher.fetchRemoteByIDs({ include }, {}, this.signal);
				}
			}

			if (Array.isArray(response?.data) && response.data.length === 0) {
				this.syncCompleted = true;
				return;
			}

			await this.collectionReplication.bulkUpsertResponse(response);
		} catch (error: any) {
			// Check if this is a CanceledError from auth flow - don't show toast
			if (isAuthCancelError(error)) {
				syncLogger.debug('Request canceled (auth in progress), will retry when auth completes', {
					context: {
						endpoint: this.endpoint,
					},
				});
				return;
			}

			// Check if app is sleeping (in background) - silent return
			if (error.isSleeping) {
				return;
			}

			// Error is already enriched with wpCode/wpMessage by httpClient
			const message = error.wpMessage || error.message || 'Failed to sync query items';
			const errorCode = error.wpCode || error.errorCode || ERROR_CODES.SERVICE_UNAVAILABLE;

			syncLogger.error(message, {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode,
					serverCode: error.wpServerCode,
					endpoint: this.endpoint,
					wpStatus: error.wpStatus,
				},
			});
		} finally {
			this.collectionReplication.start();
			this.subjects.active.next(false);
		}
	}

	/**
	 *
	 */
	nextPage() {
		this.run();
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
