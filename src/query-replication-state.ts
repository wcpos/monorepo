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
	};

	readonly paused$: Observable<boolean> = this.subjects.paused.asObservable();

	/**
	 *
	 */
	readonly error$: Observable<Error> = this.subjects.error.asObservable();

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

	async run() {
		await this.runPull();
	}

	async runPull() {
		if (this.isStopped()) {
			return;
		}

		try {
			let response;
			const include = this.collectionReplication.getUnsyncedRemoteIDs();

			if (isEmpty(include)) {
				response = await this.httpClient.get(this.endpoint);
			} else {
				response = await this.httpClient.post(
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
