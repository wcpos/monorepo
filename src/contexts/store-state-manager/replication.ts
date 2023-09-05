import get from 'lodash/get';
import { RxDocumentData, WithDeleted } from 'rxdb';
import { BehaviorSubject, Subject, Observable, Subscription, lastValueFrom } from 'rxjs';
import { filter, tap, map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { defaultFilterApiQueryParams } from './replication.helpers';

/**
 * The ReplicationState class holds the state of the replication and exposes observables
 * - It keeps track of the remote IDs that are known to the replication
 * - It keeps track of the last time the remote IDs were fetched
 * - It has some helper methods to fetch remote data
 */
export class ReplicationState<RxDocType> {
	public readonly subs: Subscription[] = [];
	public readonly subjects = {
		received: new Subject<RxDocumentData<RxDocType>>(), // all documents that are received from the endpoint
		send: new Subject<WithDeleted<RxDocType>>(), // all documents that are send to the endpoint
		error: new Subject<Error>(), // all errors that are received from the endpoint, emits new Error() objects
		canceled: new BehaviorSubject<boolean>(false), // true when the replication was canceled
		active: new BehaviorSubject<boolean>(false), // true when something is running, false when not
		remoteIDs: new BehaviorSubject<number[]>([]), // emits all remote ids that are known to the replication
	};

	readonly received$: Observable<RxDocumentData<RxDocType>> = this.subjects.received.asObservable();
	readonly send$: Observable<WithDeleted<RxDocType>> = this.subjects.send.asObservable();
	readonly error$: Observable<Error> = this.subjects.error.asObservable();
	readonly canceled$: Observable<any> = this.subjects.canceled.asObservable();
	readonly active$: Observable<boolean> = this.subjects.active.asObservable();
	readonly remoteIDs$: Observable<number[]> = this.subjects.remoteIDs.asObservable();

	// Internal state
	private isPaused = false;
	private isCanceled = false;
	private lastFetchRemoteIDsTime = null;
	private completeIntitalSync = false;
	private lastModified = null;
	private requests: Map<string, Promise<any>> = new Map();

	// constructors params
	public readonly collection: any;
	public readonly hooks: any;
	public readonly http: any;

	serializeParams(params: object): string {
		try {
			return JSON.stringify(params);
		} catch (error) {
			throw new Error(`Failed to serialize params: ${error}`);
		}
	}

	constructor({ collection, hooks, http }) {
		this.collection = collection;
		this.hooks = hooks;
		this.http = http;

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

		//
		this.subs.push(
			this.collection.getLocal$('audit').subscribe((doc) => {
				if (doc) {
					this.subjects.remoteIDs.next(doc.get('remoteIDs'));
				}
			})
		);
	}

	// Start the replication
	async start(query) {
		this.runPull(query);
	}

	// Pause the replication
	pause() {
		console.log('pausing replication');
		this.isPaused = true;
	}

	// Resume the replication
	resume(query) {
		console.log('resuming replication');
		this.isPaused = false;
		this.runPull(query);
	}

	// Cancel the replication
	cancel() {
		this.isCanceled = true;
		this.subs.forEach((sub) => sub.unsubscribe());

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
		return this.isCanceled || this.isPaused;
	}

	/**
	 *
	 */
	async apiRequestAllIDs() {
		if (this.requests.has('allIDs')) {
			return this.requests.get('allIDs');
		}
		const newRequest = this.http
			.get('', {
				params: { fields: ['id'], posts_per_page: -1 },
				_bottleneckJobOptions: {
					priority: 2,
				},
			})
			.finally((res) => {
				this.requests.delete('allIDs');
				return res;
			});
		this.requests.set('allIDs', newRequest);
		return newRequest;
	}

	/**
	 *
	 */
	async apiRequestLastModified(params) {
		const key = 'lastModified-' + this.serializeParams(params);
		if (this.requests.has(key)) {
			return this.requests.get(key);
		}
		const newRequest = this.http
			.get('', {
				// signal: controller.signal,
				params: {
					...params,
					modified_after: this.lastModified,
				},
				_bottleneckJobOptions: {
					priority: 4,
				},
			})
			.finally((res) => {
				this.requests.delete(key);
				return res;
			});
		this.requests.set(key, newRequest);
		return newRequest;
	}

	/**
	 *
	 */
	async apiRequestDataInclude(include, params) {
		const key = 'dataInclude-' + this.serializeParams(params);
		if (this.requests.has(key)) {
			return this.requests.get(key);
		}
		const newRequest = this.http
			.post(
				'',
				{
					include,
				},
				{
					params,
					headers: {
						'X-HTTP-Method-Override': 'GET',
					},
					_bottleneckJobOptions: {
						priority: 8,
					},
				}
			)
			.finally(() => {
				this.requests.delete(key);
			});
		this.requests.set(key, newRequest);
		return newRequest;
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
			const response = await this.apiRequestAllIDs();
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
	 *
	 */
	async audit() {
		let remoteIDs = this.subjects.remoteIDs.getValue();
		let localDocs = [];
		console.log('runing audit');

		if (this.lastFetchRemoteIDsTime < new Date().getTime() - 1000 * 60 * 10) {
			remoteIDs = await this.fetchRemoteIDs();
		}

		if (this.hooks?.fetchLocalDocs) {
			// special case for variations
			localDocs = await this.hooks?.fetchLocalDocs(parent);
		} else {
			localDocs = await this.collection.find().exec();
		}

		if (!Array.isArray(remoteIDs) || !Array.isArray(localDocs)) {
			throw new Error('remoteIDs or localDocs is not an array');
		}

		const localIDs = [];
		const dates = [];

		localDocs.forEach((doc) => {
			if (doc.id) {
				localIDs.push(parseInt(doc.id, 10));

				if (doc.date_modified_gmt) {
					dates.push(doc.date_modified_gmt);
				}
			}
		});

		// Sort the dates array in ascending order, then take the last one (the latest date)
		this.lastModified = dates.sort()[dates.length - 1];

		// audit the remoteIDs and localIDs
		const include = remoteIDs.filter((id) => !localIDs.includes(id)); // elements in remoteIDs but not in localIDs
		// const exclude = remoteIDs.filter((id) => localIDs.includes(id)); // elements in both remoteIDs and localIDs
		const remove = localIDs.filter((id) => !remoteIDs.includes(id)); // elements in localIDs but not in remoteIDs

		this.completeIntitalSync = include.length === 0;

		if (remove.length > 0) {
			log.warn('removing', remove, 'from', this.collection.name);
			await this.collection.find({ selector: { id: { $in: remove } } }).remove();
		}

		return { include };
	}

	/**
	 *
	 */
	async runPull(query): Promise<{ documents: any[]; checkpoint: any }> {
		if (this.isStopped()) {
			return;
		}

		this.subjects.active.next(true);

		try {
			const { include } = await this.audit();

			let params = query.getApiQueryParams();
			params = defaultFilterApiQueryParams(params);
			if (this.hooks?.filterApiQueryParams) {
				params = this.hooks.filterApiQueryParams(params, include);
			}

			/**
			 * If params hook returns false, don't fetch
			 */
			if (!params) {
				return;
			}

			let response;

			if (this.completeIntitalSync) {
				response = await this.apiRequestLastModified(params);
			} else {
				response = await this.apiRequestDataInclude(include, params);
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
		} catch (err) {
			log.error(err);
		} finally {
			this.subjects.active.next(false);
		}
	}
}
