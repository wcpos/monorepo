import { RxDBWooCommerceRestApiSyncCollectionService } from './collection-service';
import { DEFAULT_MODIFIER } from './helpers';

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
	// const collection = this;

	// fill in defaults for pull & push
	if (pull) {
		if (!pull.modifier) pull.modifier = DEFAULT_MODIFIER;
	}
	if (push) {
		if (!push.modifier) push.modifier = DEFAULT_MODIFIER;
	}

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

	// if (!autoStart) return replicationState;
	return replicationState;
}