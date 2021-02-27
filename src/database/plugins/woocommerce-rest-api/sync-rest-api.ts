import { DEFAULT_MODIFIER } from './helper';
import { RxDBWooCommerceRestApiReplicationState } from './replication-state';

type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxCollection = import('rxdb/dist/types').RxCollection;

export function syncRestApi(
	this: RxCollection,
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
	}
) {
	const collection = this;

	// fill in defaults for pull & push
	if (pull) {
		if (!pull.modifier) pull.modifier = DEFAULT_MODIFIER;
	}
	if (push) {
		if (!push.modifier) push.modifier = DEFAULT_MODIFIER;
	}

	const replicationState = new RxDBWooCommerceRestApiReplicationState(
		collection,
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

const prototypes = {
	RxCollection: (proto: any) => {
		proto.syncRestApi = syncRestApi;
	},
};

export const RxDBReplicationWooCommerceRestApiPlugin: RxPlugin = {
	name: 'replication-woocommerce-rest-api',
	rxdb: true,
	prototypes,
};
