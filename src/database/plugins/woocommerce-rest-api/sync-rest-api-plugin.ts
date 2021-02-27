import { DEFAULT_MODIFIER } from './helper';
import { RxDBWooCommerceRestApiSyncCollectionService } from './sync-collection-service';
import { RxDBWooCommerceRestApiSyncDocumentService } from './sync-document-service';

type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxCollection = import('rxdb/dist/types').RxCollection;
type RxDocument = import('rxdb/dist/types').RxDocument;

export function syncRestApiCollection(
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

export function syncRestApiDocument(
	this: RxDocument,
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
	const replicationState = new RxDBWooCommerceRestApiSyncDocumentService(
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

const prototypes = {
	RxCollection: (proto: any) => {
		proto.syncRestApi = syncRestApiCollection;
	},
	RxDocument: (proto: any) => {
		proto.syncRestApi = syncRestApiDocument;
	},
};

export const RxDBSyncWooCommerceRestApiPlugin: RxPlugin = {
	name: 'sync-woocommerce-rest-api',
	rxdb: true,
	prototypes,
};
