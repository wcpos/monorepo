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

import type { CollectionReplicationState } from './collection-replication-state';
import type { RxCollection } from 'rxdb';

interface QueryReplicationConfig<T extends RxCollection> {
	collection: T;
	httpClient: any;
	collectionReplication: CollectionReplicationState<T>;
	hooks?: any;
	endpoint: string;
}

export class QueryReplicationState<T extends RxCollection> {
	private isCanceled = false;
	private pollingTime = 1000 * 60 * 5; // 5 minutes
	public readonly collection: T;
	public readonly httpClient: any;
	public readonly endpoint: any;
	public readonly collectionReplication: CollectionReplicationState<T>;

	/**
	 *
	 */
	public readonly subs: Subscription[] = [];
	public readonly subjects = {
		error: new Subject<Error>(),
		paused: new BehaviorSubject<boolean>(true), // true when the replication is paused, start true
		active: new BehaviorSubject<boolean>(false), // true when something is running, false when not
	};

	/**
	 *
	 */
	readonly error$: Observable<Error> = this.subjects.error.asObservable();
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
	}: QueryReplicationConfig<T>) {
		this.collection = collection;
		this.httpClient = httpClient;
		this.endpoint = endpoint;
		this.collectionReplication = collectionReplication;

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

		this.subjects.active.next(true);
		const include = this.collectionReplication.getUnsyncedRemoteIDs();
		const lastModified = this.collectionReplication.subjects.lastModified.getValue();

		/**
		 * If there is nothing to fetch, then return
		 */
		if (isEmpty(include) && !lastModified) {
			return;
		}

		try {
			let response;

			if (isEmpty(include)) {
				response = await this.fetchLastModified({ lastModified });
			} else {
				response = await this.fetchRemoteIDs({ include });
			}

			if (!response.data) {
				this.subjects.error.next(response);
			}

			const promises = response.data.map(async (doc) => {
				const parsedData = this.collection.parseRestResponse(doc);
				await this.collection.upsertRefs(parsedData); // upsertRefs mutates the parsedData
				return parsedData;
			});

			const documents = await Promise.all(promises);

			await this.collection.bulkUpsert(documents);
		} catch (error) {
			this.subjects.error.next(error);
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

	/**
	 * Cancel
	 *
	 * Make sure we clean up subscriptions:
	 * - things we subscribe to in this class, also
	 * - complete the observables accessible from this class
	 */
	cancel() {
		this.isCanceled = true;
		this.subs.forEach((sub) => sub.unsubscribe());

		// Complete subjects
		this.subjects.error.complete();
	}
}
