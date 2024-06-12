import intersection from 'lodash/intersection';
import isEmpty from 'lodash/isEmpty';
import { BehaviorSubject, Observable, Subscription, Subject, interval } from 'rxjs';
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
import { getParamValueFromEndpoint } from './utils';

import type { CollectionReplicationState } from './collection-replication-state';
import type { RxCollection } from 'rxdb';

interface QueryReplicationConfig<T extends RxCollection> {
	collection: T;
	httpClient: any;
	collectionReplication: CollectionReplicationState<T>;
	hooks?: any;
	endpoint: string;
	errorSubject: Subject<Error>;
	greedy?: boolean;
}

export class QueryReplicationState<T extends RxCollection> extends SubscribableBase {
	public readonly pollingTime = 1000 * 60 * 5; // 5 minutes
	public readonly collection: T;
	public readonly httpClient: any;
	public readonly endpoint: any;
	public readonly errorSubject: Subject<Error>;
	public readonly collectionReplication: CollectionReplicationState<T>;
	public syncCompleted = false;
	public readonly greedy;

	/**
	 *
	 */
	public readonly subs: Subscription[] = [];
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
	constructor({
		collection,
		httpClient,
		collectionReplication,
		endpoint,
		errorSubject,
		greedy = false,
	}: QueryReplicationConfig<T>) {
		super();
		this.collection = collection;
		this.httpClient = httpClient;
		this.endpoint = endpoint;
		this.collectionReplication = collectionReplication;
		this.errorSubject = errorSubject;
		this.greedy = greedy;

		/**
		 * Push all internal subscriptions to the subs array
		 * Internal subscriptions are cleaned up when replication is canceled
		 */
		this.setupPolling();
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
	 *
	 */
	async run({ force }: { force?: boolean } = {}) {
		if (this.isStopped() && force) {
			this.start();
		}

		// await this.collectionReplication.firstSync;
		const saved = await this.sync();

		if (this.greedy && saved && saved.length > 0) {
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

		// Create a sync promise to pause the collection sync, until we are finished
		let resolveQueryPromise: () => void;
		const queryPromise = new Promise<void>((resolve) => {
			resolveQueryPromise = resolve;
		});
		this.collectionReplication.setQuerySyncPromise(queryPromise);

		let include = await this.collectionReplication.getUnsyncedRemoteIDs();
		let exclude = await this.collectionReplication.getSyncedRemoteIDs();
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
					response = await this.fetchRemoteByIDs({ exclude });
				} else {
					response = await this.fetchRemoteByIDs({ include });
				}
			}

			if (Array.isArray(response?.data) && response.data.length === 0) {
				this.syncCompleted = true;
				return;
			}

			await this.collectionReplication.bulkUpsertResponse(response);
		} catch (error) {
			this.errorSubject.next(error);
		} finally {
			// Resolve the query sync promise
			resolveQueryPromise();
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

	/**
	 * ------------------------------
	 * Fetch methods
	 * ------------------------------
	 * @NOTE: this endpoint is different to the general collection endpoint, it has query params
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
}
