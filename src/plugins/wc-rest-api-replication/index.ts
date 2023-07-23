import { CPromise } from 'c-promise2';
import { addRxPlugin } from 'rxdb';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import { PROMISE_RESOLVE_TRUE, flatClone } from 'rxdb/plugins/utils';
import { BehaviorSubject, Subject, Subscription, Observable } from 'rxjs';

import type {
	ReplicationOptions,
	ReplicationPullOptions,
	ReplicationPushOptions,
	RxCollection,
	RxError,
	RxTypeError,
	WithDeleted,
	RxDocumentData,
	RxReplicationPullStreamItem,
} from 'rxdb';

interface WcRestApiReplicationPullOptions<RxDocType, CheckpointType>
	extends ReplicationPullOptions<RxDocType, CheckpointType> {
	/**
	 * A function that fetches the IDs of the remote documents
	 */
	fetchRemoteIDs: () => Promise<string[]>;
	/**
	 * A function that fetches the localDocs with ID
	 */
	fetchLocalDocs: () => Promise<string[]>;
}

interface WcRestApiReplicationOptions<RxDocType, CheckpointType>
	extends ReplicationOptions<RxDocType, CheckpointType> {
	pull?: WcRestApiReplicationPullOptions<RxDocType, CheckpointType>;
}

export const replicationStates: Map<string, RxReplicationState<any, any>> = new Map();

/**
 * The standard RxDB replication state has a lot of checkpoint logic that is not needed for the
 * WooCommerce REST API. This class is a custom implementation of the RxDB replication state that
 * only includes the logic needed for the WooCommerce REST API.
 */
class RxReplicationState<RxDocType, CheckpointType> {
	public readonly subjects = {
		canceled: new BehaviorSubject(false),
		active: new BehaviorSubject(false),
		error: new Subject(),
		received: new Subject(),
		send: new Subject(),
		remoteIDs: new BehaviorSubject([]),
	};

	public readonly subs: Subscription[] = [];

	readonly received$: Observable<RxDocumentData<RxDocType>> = this.subjects.received.asObservable();
	readonly send$: Observable<WithDeleted<RxDocType>> = this.subjects.send.asObservable();
	readonly error$: Observable<RxError | RxTypeError> = this.subjects.error.asObservable();
	readonly canceled$: Observable<any> = this.subjects.canceled.asObservable();
	readonly active$: Observable<boolean> = this.subjects.active.asObservable();
	readonly remoteIDs$: Observable<number[]> = this.subjects.remoteIDs.asObservable();

	public remoteEvents$: Subject<RxReplicationPullStreamItem<RxDocType, CheckpointType>> =
		new Subject();

	private currentPull: CPromise<void> | null = null;
	private started = false;

	constructor(
		/**
		 * hash of the identifier, used to flag revisions
		 * and to identify which documents state came from the remote.
		 */
		public readonly replicationIdentifierHash: string,
		public readonly collection: RxCollection<RxDocType>,
		public readonly deletedField: string,
		public readonly pull?: WcRestApiReplicationPullOptions<RxDocType, CheckpointType>,
		public readonly push?: ReplicationPushOptions<RxDocType>,
		public readonly live?: boolean,
		public retryTime?: number,
		public autoStart?: boolean
	) {
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

		// subscribe to pull stream$ events
		if (this.pull && this.pull.stream$ && this.live) {
			this.subs.push(
				this.pull.stream$.subscribe({
					next: (ev) => {
						this.remoteEvents$.next(ev);
					},
					error: (err) => {
						this.subjects.error.next(err);
					},
				})
			);
		}

		// subscribe to the remoteEvents$
		this.subs.push(
			this.remoteEvents$.subscribe({
				next: (ev) => {
					if (ev === 'RESYNC') {
						/**
						 * TODO: set remote ids lastAudit to null to force a remoteID fetch?
						 */
						this.start({ resync: true });
					}
					if (ev === 'QUERY') {
						// Cancel the current pull operation if there is one
						if (this.currentPull) {
							this.currentPull.cancel();
							this.currentPull = null;
						}
						this.start({ resync: true });
					}
				},
			})
		);

		// subscribe to local remoteIDs storage
		this.subs.push(
			collection.getLocal$(replicationIdentifierHash).subscribe({
				next: (doc) => {
					if (doc) {
						this.subjects.remoteIDs.next(doc.get('remoteIDs'));
					}
				},
			})
		);
	}

	/**
	 *
	 */
	async fetchAndSaveRemoteIDs(): Promise<void> {
		const fetchRemoteIDs = this.pull && this.pull.fetchRemoteIDs;
		if (fetchRemoteIDs) {
			// get remoteIDs from local storage
			let result = await this.collection.getLocal(this.replicationIdentifierHash);
			// if not found, or if lastAudit is more than 10 minutes ago
			if (!result || new Date(result.get('lastAudit')).getTime() < new Date().getTime() - 1000 * 60 * 10) {
				// fetch remoteIDs
				const remoteIDs = await fetchRemoteIDs();
				// save remoteIDs to local storage
				result = await this.collection.upsertLocal(this.replicationIdentifierHash, {
					remoteIDs,
					lastAudit: new Date().toISOString(),
				});
			}

			// return remoteIDs
			return result.get('remoteIDs');
		} else {
			throw new Error('fetchRemoteIDs is not defined');
		}
	}

	/**
	 *
	 */
	async runPull(batchSize, count): Promise<{ documents: any[]; checkpoint: any }> {
		const pullModifier =
			this.pull && this.pull.modifier ? this.pull.modifier : (d: any) => Promise.resolve(d);

		// get remoteIDs
		const remoteIDs = await this.fetchAndSaveRemoteIDs();

		// get all local docs
		const localDocs = await this.pull.fetchLocalDocs();

		let localIDs = [];
		let dates = [];

		localDocs.forEach(doc => {
			if (doc.id) {
				localIDs.push(parseInt(doc.id, 10));
		
				if (doc.date_modified_gmt) {
					dates.push(doc.date_modified_gmt);
				}
			}
		});

		// Sort the dates array in ascending order, then take the last one (the latest date)
		const lastModified = dates.sort()[dates.length - 1];

		// audit the remoteIDs and localIDs
		const include = remoteIDs.filter((id) => !localIDs.includes(id)); // elements in remoteIDs but not in localIDs
		const exclude = remoteIDs.filter((id) => localIDs.includes(id)); // elements in both remoteIDs and localIDs
		const remove = localDocs
			.filter((doc) => !remoteIDs.includes(doc.id)) // elements in localIDs but not in remoteIDs
			.map((doc) => doc.uuid); // get the uuids of the items to be removed

		const completeIntitalSync = include.length === 0;

		// remove orphaned documents
		if (remove.length > 0) {
			await this.collection.bulkRemove(remove);
		}

		// these values then become the checkpoint for the pull handler
		const checkpoint = {
			include,
			exclude,
			lastModified,
			completeIntitalSync,
			count,
		};

		const result = await this.pull.handler(checkpoint, batchSize);

		const useResult = flatClone(result);
		useResult.documents = await Promise.all(useResult.documents.map((d) => pullModifier(d)));

		// insert documents
		await this.collection.bulkInsert(useResult.documents);

		return useResult;
	}

	/**
	 *
	 */
	async start(options = { resync: false }): Promise<void> {
		if (this.isStopped()) {
			return;
		}

		// started flag to prevent multiple start() calls on re-renders
		if(this.started && !options.resync) {
			return;
		}
		this.started = true;

		// Emit active event
		this.subjects.active.next(true);

		//
		try {
			const batchSize = this.pull.batchSize || 10;

			let count = 0;
			let resultLength = batchSize;
			while (!this.isStopped() && resultLength === batchSize && count < 5) {
				// Wrap runPull in a CPromise
				const pullOp = new CPromise((resolve, reject, { onCancel }) => {
					onCancel(() => {
						// Logic to stop ongoing pull operation
						// Possibly: resolve with a specific value or reject
					});

					this.runPull(batchSize, count).then(resolve).catch(reject);
				});

				// Store the operation so that we can cancel it later
				this.currentPull = pullOp;

				const result = await pullOp;
				resultLength = result.documents.length;
				count++;

				this.currentPull = null;
			}
		} catch (err) {
			console.error(err);
		} finally {
			this.subjects.active.next(false);
		}
	}

	isStopped(): boolean {
		return this.subjects.canceled.getValue();
	}

	isStarted(): boolean {
		return !this.isStopped() && this.started;
	}

	async awaitInitialReplication(): Promise<void> {
		// Wait for the initial replication to complete here
	}

	async awaitInSync(): Promise<void> {
		// Wait for the replication to be in sync here
	}

	reSync(): void {
		this.remoteEvents$.next('RESYNC');
	}

	emitEvent(ev: any): void {
		// Emit a custom event here
	}

	cancel(): Promise<void> {
		if (this.isStopped()) {
			return Promise.resolve();
		}

		this.subjects.canceled.next(true);
		this.subjects.active.complete();
		this.subjects.canceled.complete();
		this.subjects.error.complete();
		this.subjects.received.complete();
		this.subjects.send.complete();
		this.subjects.remoteIDs.complete();

		// Cancel your custom replication process here

		return Promise.resolve();
	}
}

/**
 *
 */
export function replicateRxCollection<RxDocType, CheckpointType>({
	replicationIdentifier,
	collection,
	deletedField = '_deleted',
	pull,
	push,
	live = true,
	retryTime = 1000 * 5,
	waitForLeadership = true,
	autoStart = false,
}: WcRestApiReplicationOptions<RxDocType, CheckpointType>): RxReplicationState<
	RxDocType,
	CheckpointType
> {
	addRxPlugin(RxDBLeaderElectionPlugin);

	const replicationIdentifierHash = collection.database.hashFunction(
		[collection.database.name, collection.name, replicationIdentifier].join('|')
	);

	const replicationState = new RxReplicationState<RxDocType, CheckpointType>(
		replicationIdentifierHash,
		collection,
		deletedField,
		pull,
		push,
		live,
		retryTime,
		autoStart
	);

	startReplicationOnLeaderShip(waitForLeadership, replicationState);
	return replicationState as any;
}

/**
 *
 */
export function startReplicationOnLeaderShip(
	waitForLeadership: boolean,
	replicationState: RxReplicationState<any, any>
) {
	/**
	 * Always await this Promise to ensure that the current instance
	 * is leader when waitForLeadership=true
	 */
	const mustWaitForLeadership =
		waitForLeadership && replicationState.collection.database.multiInstance;
	const waitTillRun: Promise<any> = mustWaitForLeadership
		? replicationState.collection.database.waitForLeadership()
		: PROMISE_RESOLVE_TRUE;
	return waitTillRun.then(() => {
		if (replicationState.isStopped()) {
			return;
		}
		if (replicationState.autoStart) {
			replicationState.start();
		}
	});
}
