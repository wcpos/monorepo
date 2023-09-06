import Bottleneck from 'bottleneck';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import { RxDocumentData, WithDeleted } from 'rxdb';
import { BehaviorSubject, Subject, Observable, Subscription, lastValueFrom, interval } from 'rxjs';
import {
	filter,
	tap,
	map,
	switchMap,
	startWith,
	debounceTime,
	distinctUntilChanged,
} from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { defaultFilterApiQueryParams } from './replication.helpers';

/**
 * The Bottleneck class is used to limit the number of concurrent requests
 * - generally we only want to run job at a time, eg: audit, then pull, then push
 *
 * The ReplicationState class holds the state of the replication and exposes observables
 * - Audit runs first and is the highest priority, it initializes the replication state so we know
 *  what remote IDs are known to the replication, and what the last modified date is
 * - Next priority is responding to the queryState, we want to make sure the user has the information
 * they are looking for as quickly as possible
 * - Next we set up a general pull/push replication that runs in the background
 *
 * There are also some helper methods to pull/push on demand
 */
export class ReplicationState<RxDocType> {
	public readonly subs: Subscription[] = [];
	public readonly subjects = {
		received: new Subject<RxDocumentData<RxDocType>>(), // all documents that are received from the endpoint
		send: new Subject<WithDeleted<RxDocType>>(), // all documents that are sent to the endpoint
		error: new Subject<Error>(), // all errors that are received from the endpoint, emits new Error() objects
		canceled: new BehaviorSubject<boolean>(false), // true when the replication was canceled
		active: new BehaviorSubject<boolean>(false), // true when something is running, false when not
		remoteIDs: new BehaviorSubject<number[]>([]), // emits all remote ids that are known to the replication
		localIDs: new BehaviorSubject<number[]>([]), // emits all local ids that are known to the replication
		lastModified: new BehaviorSubject<string>(null), // emits the date of the last modified document
		paused: new BehaviorSubject<boolean>(true), // true when the replication is paused, start true
	};

	readonly received$: Observable<RxDocumentData<RxDocType>> = this.subjects.received.asObservable();
	readonly send$: Observable<WithDeleted<RxDocType>> = this.subjects.send.asObservable();
	readonly error$: Observable<Error> = this.subjects.error.asObservable();
	readonly canceled$: Observable<any> = this.subjects.canceled.asObservable();
	readonly active$: Observable<boolean> = this.subjects.active
		.asObservable()
		.pipe(debounceTime(250), distinctUntilChanged()); // debounce to prevent flickering
	readonly remoteIDs$: Observable<number[]> = this.subjects.remoteIDs.asObservable();
	readonly localIDs$: Observable<number[]> = this.subjects.localIDs.asObservable();
	readonly lastModified$: Observable<string> = this.subjects.lastModified.asObservable();
	readonly paused$: Observable<boolean> = this.subjects.paused.asObservable();

	// Internal state
	private isCanceled = false;
	private lastFetchRemoteIDsTime = null;

	// constructors params
	public readonly collection: any;
	public readonly hooks: any;
	public readonly http: any;
	public readonly limiter: any;

	/**
	 *
	 */
	constructor({ collection, hooks, http }) {
		this.collection = collection;
		this.hooks = hooks;
		this.http = http;
		this.limiter = new Bottleneck({
			maxConcurrent: 1,
		});

		// stop the replication when the collection gets destroyed
		this.collection.onDestroy.push(() => this.cancel());

		// create getters for the observables
		Object.keys(this.subjects).forEach((key) => {
			Object.defineProperty(this, key + '$', {
				get() {
					return this.subjects[key].asObservable();
				},
			});
		});

		// subscribe to the local audit doc
		this.subs.push(
			this.collection.getLocal$('audit').subscribe((doc) => {
				if (doc) {
					this.subjects.remoteIDs.next(doc.get('remoteIDs'));
				}
			})
		);

		// subscribe to collection changes
		this.subs.push(
			this.collection
				.find({
					selector: {
						id: { $ne: null },
					},
					sort: [{ date_modified_gmt: 'desc' }],
				})
				.$.subscribe((docs) => {
					const ids = docs.map((doc) => doc.get('id'));
					const lastModified = docs[0]?.get('date_modified_gmt');
					this.subjects.localIDs.next(ids);
					this.subjects.lastModified.next(lastModified);
				})
		);

		// set up audit on a 10 minute interval
		this.subs.push(
			this.paused$
				.pipe(
					switchMap((isPaused) => (isPaused ? [] : interval(1000 * 60 * 10).pipe(startWith(0)))),
					filter(() => !this.subjects.paused.getValue())
				)
				.subscribe(async () => {
					await this.runAudit();

					// also check for recent updates
					const lastModified = this.subjects.lastModified.getValue();
					if (lastModified) {
						this.runPull(
							{
								after: lastModified,
							},
							[]
						);
					} else {
						this.runPull({ orderby: 'date', order: 'desc' }, []);
					}
				})
		);

		// listen to scheduled jobs
		this.limiter.on('executing', () => {
			this.subjects.active.next(true);
		});
		this.limiter.on('done', () => {
			this.subjects.active.next(false);
		});
		this.limiter.on('error', (error) => {
			this.subjects.error.next(error);
		});
	}

	/**
	 *
	 */
	async start() {
		this.subjects.paused.next(false);
	}

	// Pause the replication
	pause() {
		console.log('pausing replication');
		this.subjects.paused.next(true);
	}

	// Cancel the replication
	cancel() {
		this.isCanceled = true;
		this.subs.forEach((sub) => sub.unsubscribe());
		this.limiter.stop();

		this.subjects.active.next(false);
		this.subjects.canceled.next(true);

		this.subjects.active.complete();
		this.subjects.canceled.complete();
		this.subjects.error.complete();
		this.subjects.received.complete();
		this.subjects.send.complete();
		this.subjects.remoteIDs.complete();
	}

	isStopped() {
		return this.isCanceled || this.subjects.paused.getValue();
	}

	getUnsyncedRemoteIDs() {
		const remoteIDs = this.subjects.remoteIDs.getValue();
		const localIDs = this.subjects.localIDs.getValue();
		return remoteIDs.filter((id) => !localIDs.includes(id));
	}

	nextPage(queryParams) {
		const unsynced = this.getUnsyncedRemoteIDs();
		if (unsynced.length > 0) {
			return this.runPull(queryParams, unsynced);
		}
	}

	/**
	 *
	 */
	async runAudit() {
		if (this.lastFetchRemoteIDsTime < new Date().getTime() - 1000 * 60 * 10) {
			return this.limiter
				.schedule({ priority: 2, id: 'audit' }, this.fetchRemoteIDs.bind(this))
				.catch((error) => this.subjects.error.next(error));
		}
	}

	/**
	 *
	 */
	async runPull(queryParams = {}, forceInclude = null) {
		if (this.isStopped()) {
			return;
		}

		const include = forceInclude || this.getUnsyncedRemoteIDs();

		// filter the query params into the format we want for WC REST API
		let params = defaultFilterApiQueryParams(queryParams);
		if (this.hooks?.filterApiQueryParams) {
			params = this.hooks.filterApiQueryParams(params, include);
		}

		// allow early exit from some pull requests
		if (!params) {
			return;
		}

		return this.limiter
			.schedule({ priority: 6, id: 'pull' }, this.pull.bind(this, params, include))
			.catch((error) => {
				this.subjects.error.next(error);
			});
	}

	/**
	 * Makes a request the the endpoint to fetch all remote IDs
	 * - can be overwritten by the fetchRemoteIDs hook, this is required for variations
	 */
	async fetchRemoteIDs(): Promise<number[]> {
		let remoteIDs = null;
		console.log('fetching remote ids');

		if (this.hooks?.fetchRemoteIDs) {
			// special case for variations
			remoteIDs = await this.hooks?.fetchRemoteIDs(parent);
		} else {
			const response = await this.http.get('', {
				params: { fields: ['id'], posts_per_page: -1 },
			});
			const data = get(response, 'data');
			remoteIDs = data.map((doc) => doc.id);
		}

		// Check if data is an array and its items have a property 'id' of type number
		if (Array.isArray(remoteIDs) && remoteIDs.every((item) => typeof item === 'number')) {
			await this.collection.upsertLocal('audit', { remoteIDs });
			this.lastFetchRemoteIDsTime = new Date().getTime();
			return remoteIDs;
		} else {
			throw new Error('Fetch remote IDs failed');
		}
	}

	/**
	 * Makes a request to the server and saves the data to the local database
	 */
	async pull(params, include) {
		let response;

		if (isEmpty(include)) {
			response = await this.http.get('', { params });
		} else {
			response = await this.http.post(
				'',
				{
					include,
				},
				{
					params,
					headers: {
						'X-HTTP-Method-Override': 'GET',
					},
				}
			);
		}

		const data = get(response, 'data', []);

		const promises = data.map(async (doc) => {
			const parsedData = this.collection.parseRestResponse(doc);
			await this.collection.upsertRefs(parsedData); // upsertRefs mutates the parsedData
			return parsedData;
		});

		const documents = await Promise.all(promises);
		console.log('here comes', documents);

		await this.collection.bulkInsert(documents);
	}
}
