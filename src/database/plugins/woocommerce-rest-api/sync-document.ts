import { RxDBWooCommerceRestApiSyncDocumentService } from './document-service';
import { DEFAULT_MODIFIER } from './helpers';

type RxCollection = import('rxdb/dist/types').RxCollection;
type RxDocument = import('rxdb/dist/types').RxDocument;
type Document = RxDocument & {
	toRestApiJSON: () => Record<string, unknown>;
	collections: () => Record<string, RxCollection>;
};

/**
 *
 */
 export function syncRestApiDocument(
	this: Document,
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