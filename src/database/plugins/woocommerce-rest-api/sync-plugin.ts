import isFunction from 'lodash/isFunction';
import { DEFAULT_MODIFIER } from './helpers';
import { RxDBWooCommerceRestApiSyncCollectionService } from './collection-service';
import { RxDBWooCommerceRestApiSyncDocumentService } from './document-service';

type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxCollection = import('rxdb/dist/types').RxCollection;
type RxDocument = import('rxdb/dist/types').RxDocument;
export type Document = RxDocument & {
	toRestApiJSON: () => Record<string, unknown>;
	collections: () => Record<string, RxCollection>;
};
export type Collection = RxCollection & { collections: () => Record<string, RxCollection> };
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

/**
 *
 */
export async function toRestApiJSON(this: Document) {
	const json: Record<string, unknown> = this.toJSON();

	if (typeof json.id === 'string' && json.id.substring(0, 3) === 'new') {
		json.id = undefined;
	}

	if (this.collection.name === 'orders') {
		// add line_items
		// @ts-ignore
		const lineItems = await this.collections().line_items.findByIds(this.line_items || []);
		json.line_items = await Promise.all(
			Array.from(lineItems.values()).map((doc) => doc.toRestApiJSON())
		);
	}

	// if (this.collection.name === 'line_items') {
	// }

	return json;
}

/**
 *
 */
const prototypes = {
	RxCollection: (proto: any) => {
		proto.syncRestApi = syncRestApiCollection;
	},
	RxDocument: (proto: any) => {
		proto.syncRestApi = syncRestApiDocument;
		proto.toRestApiJSON = toRestApiJSON;
	},
};

/**
 *
 */
const hooks = {};

export const RxDBWooCommerceRestApiSyncPlugin: RxPlugin = {
	name: 'woocommerce-rest-api-sync',
	rxdb: true,
	prototypes,
	hooks,
};
