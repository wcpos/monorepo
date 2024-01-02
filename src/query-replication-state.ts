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

import type { CollectionReplicationState } from './collection-replication-state';
import type { RxCollection } from 'rxdb';

interface QueryReplicationConfig<T extends RxCollection> {
	collection: T;
	httpClient: any;
	collectionReplication: CollectionReplicationState<T>;
	hooks?: any;
	endpoint: string;
	errorSubject: Subject<Error>;
}

export class QueryReplicationState<T extends RxCollection> extends SubscribableBase {
	private pollingTime = 1000 * 60 * 5; // 5 minutes
	public readonly collection: T;
	public readonly httpClient: any;
	public readonly endpoint: any;
	private errorSubject: Subject<Error>;
	public readonly collectionReplication: CollectionReplicationState<T>;

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
	readonly paused$: Observable<boolean> = this.subjects.paused.asObservable();
	readonly active$: Observable<boolean> = this.subjects.active.asObservable();

	/**
	 *
	 */
	constructor({
		collection,
		httpClient,
		collectionReplication,
		endpoint,
		errorSubject,
	}: QueryReplicationConfig<T>) {
		super();
		this.collection = collection;
		this.httpClient = httpClient;
		this.endpoint = endpoint;
		this.collectionReplication = collectionReplication;
		this.errorSubject = errorSubject;

		/**
		 *
		 */
		this.subs.push(
			/**
			 * Pause/Start the replication
			 */
			this.paused$
				.pipe(
					switchMap((isPaused) => (isPaused ? [] : interval(this.pollingTime).pipe(startWith(0)))),
					filter(() => !this.subjects.paused.getValue())
				)
				.subscribe(async () => {
					this.run();
				})

			/**
			 *
			 */
		);
	}

	/**
	 *
	 */
	async run() {
		await this.collectionReplication.firstSync;
		await this.runPull();
	}

	/**
	 *
	 */
	async runPull() {
		if (this.isStopped() || this.subjects.active.getValue()) {
			return;
		}

		const include = await this.collectionReplication.getUnsyncedRemoteIDs();
		const lastModified = this.collectionReplication.subjects.lastModified.getValue();

		/**
		 * If there is nothing to fetch, then return
		 */
		if (isEmpty(include) && !lastModified) {
			return;
		}

		this.subjects.active.next(true);

		try {
			let response;

			if (isEmpty(include)) {
				response = await this.fetchLastModified({ lastModified });
			} else {
				response = await this.fetchRemoteIDs({ include });
			}

			if (!response.data) {
				this.errorSubject.next(response);
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
	async fetchRemoteIDs({ include }) {
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
