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

import { isArrayOfIntegers } from './utils';

import type { RxCollection } from 'rxdb';

export interface QueryHooks {
	preEndpoint?: (collection: RxCollection) => string;
}

interface CollectionReplicationConfig<T extends RxCollection> {
	collection: T;
	httpClient: any;
	hooks?: any;
}

export class CollectionReplicationState<T extends RxCollection> {
	private hooks: CollectionReplicationConfig<T>['hooks'];
	public readonly endpoint: string;
	public readonly collection: T;
	public readonly httpClient: any;

	/**
	 * Internal State
	 */
	private isCanceled = false;
	private lastFetchRemoteIDsTime = null;
	private pollingTime = 1000 * 60 * 5; // 5 minutes

	/**
	 *
	 */
	public readonly subs: Subscription[] = [];
	public readonly subjects = {
		error: new Subject<Error>(),
		remoteIDs: new BehaviorSubject<number[]>([]), // emits all remote ids that are known to the replication
		localIDs: new BehaviorSubject<number[]>([]), // emits all local ids that are known to the replication
		lastModified: new BehaviorSubject<string>(null), // emits the date of the last modified document
		paused: new BehaviorSubject<boolean>(true), // true when the replication is paused, start true
	};

	/**
	 *
	 */
	readonly error$: Observable<Error> = this.subjects.error.asObservable();
	readonly remoteIDs$: Observable<number[]> = this.subjects.remoteIDs.asObservable();
	readonly localIDs$: Observable<number[]> = this.subjects.localIDs.asObservable();
	readonly lastModified$: Observable<string> = this.subjects.lastModified.asObservable();
	readonly paused$: Observable<boolean> = this.subjects.paused.asObservable();

	/**
	 *
	 */
	constructor({ collection, httpClient, hooks }: CollectionReplicationConfig<T>) {
		this.collection = collection;
		this.httpClient = httpClient;
		this.hooks = hooks || {};
		this.endpoint = this.getEndpoint();

		/**
		 * Subscribe to the remoteIDs local document
		 */
		this.subs.push(
			collection.getLocal$('audit').subscribe((doc) => {
				if (doc) {
					this.subjects.remoteIDs.next(doc.get('remoteIDs'));
				}
			})
		);

		/**
		 * Subscribe to collection changes and track the array of localIDs and lastModified date
		 * @TODO - categories and tags don't have a date_modified_gmt field, what to do?
		 * @TODO - get the IDs without having to construict the whole document
		 */
		this.subs.push(
			this.collection
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
				})
		);

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

	/**
	 * Run the collection replication
	 */
	async run() {
		await this.auditIDs();
		// await this.syncLastModified();
		// await this.syncRemoteIDs();
	}

	/**
	 * Allow the user to override the endpoint, eg: variations collection will have
	 * /products/<parent_id>/variations endpoint
	 */
	getEndpoint(): string {
		if (this.hooks.preEndpoint) {
			return this.hooks.preEndpoint(this.collection);
		}
		return this.collection.name;
	}

	/**
	 *
	 */
	async auditIDs() {
		if (this.isStopped()) {
			return;
		}

		let remoteIDs;
		if (this.lastFetchRemoteIDsTime < new Date().getTime() - this.pollingTime) {
			remoteIDs = await this.fetchRemoteIDs();
			if (isArrayOfIntegers(remoteIDs)) {
				await this.collection.upsertLocal('audit', { remoteIDs });
				this.subjects.remoteIDs.next(remoteIDs);
			}
		} else {
			remoteIDs = this.subjects.remoteIDs.getValue();
		}

		if (!Array.isArray(remoteIDs) || remoteIDs.length === 0) {
			return;
		}

		/**
		 * @TODO - variations can be orphaned at the moment, we need a relationship table with parent
		 */
		const remove = this.subjects.localIDs.getValue().filter((id) => !remoteIDs.includes(id));
		if (remove.length > 0 && this.collection.name !== 'variations') {
			// deletion should be rare, only when an item is deleted from the server
			console.warn('removing', remove, 'from', this.collection.name);
			await this.collection.find({ selector: { id: { $in: remove } } }).remove();
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

		try {
			const response = await this.httpClient.get(this.endpoint, {
				params: { fields: ['id'], posts_per_page: -1 },
			});

			if (!response.data || !Array.isArray(response.data)) {
				throw new Error('Invalid response data for remote IDs');
			}

			return response.data.map((doc) => doc.id);
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
