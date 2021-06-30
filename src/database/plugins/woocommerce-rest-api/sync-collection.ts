import { RxDBWooCommerceRestApiSyncCollectionService } from './collection-service';
import { DEFAULT_MODIFIER, promiseWait, wasRevisionfromPullReplication } from './helpers';

type RxCollection = import('rxdb/dist/types').RxCollection;
type Collection = RxCollection & { collections: () => Record<string, RxCollection> };

/**
 *
 */
export function syncRestApiCollection(
	this: Collection,
	{
		url,
		auth = {},
		waitForLeadership = true,
		pull,
		push,
		deletedFlag,
		lastPulledRevField = 'last_pulled_rev',
		live = false,
		liveInterval = 1000 * 10, // in ms
		retryTime = 1000 * 5, // in ms
		autoStart = true, // if this is false, the replication does nothing at start
		syncRevisions = false,
	}: any
) {
	const collection = this;

	// fill in defaults for pull & push
	if (pull) {
		if (!pull.modifier) pull.modifier = DEFAULT_MODIFIER;
	}
	if (push) {
		if (!push.modifier) push.modifier = DEFAULT_MODIFIER;
	}

	// ensure the collection is listening to plain-pouchdb writes
	//  collection.watchForChanges();

	const replicationState = new RxDBWooCommerceRestApiSyncCollectionService(
		this,
		url,
		auth,
		pull,
		push,
		deletedFlag,
		lastPulledRevField,
		live,
		liveInterval,
		retryTime,
		syncRevisions
	);

	if (!autoStart) {
		return replicationState;
	}

	// run internal so .sync() does not have to be async
	const waitTillRun: any =
		waitForLeadership && this.database.multiInstance // do not await leadership if not multiInstance
			? this.database.waitForLeadership()
			: promiseWait(0);

	waitTillRun.then(() => {
		if (collection.destroyed) {
			return;
		}

		// trigger run once
		replicationState.run();
		debugger;
		// start sync-interval
		if (replicationState.live) {
			if (pull) {
				(async () => {
					while (!replicationState.isStopped()) {
						await promiseWait(replicationState.liveInterval);
						if (replicationState.isStopped()) return;
						await replicationState.run(
							// do not retry on liveInterval-runs because they might stack up
							// when failing
							false
						);
					}
				})();
			}

			if (push) {
				/**
				 * we have to use the rxdb changestream
				 * because the pouchdb.changes stream sometimes
				 * does not emit events or stucks
				 */
				const changeEventsSub = collection.$.subscribe((changeEvent) => {
					if (replicationState.isStopped()) return;
					const rev = changeEvent.documentData._rev;
					if (rev && !wasRevisionfromPullReplication(replicationState.endpointHash, rev)) {
						replicationState.run();
					}
				});
				replicationState._subs.push(changeEventsSub);
			}
		}
	});

	return replicationState;
}
