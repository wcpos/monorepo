import isFunction from 'lodash/isFunction';
import unset from 'lodash/unset';
import snakeCase from 'lodash/snakeCase';
import forEach from 'lodash/forEach';
import invokeMap from 'lodash/invokeMap';
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

	if (this.collection.name === 'orders') {
		json.line_items = await this.populate('lineItems').then((items) =>
			Promise.all(invokeMap(items, toRestApiJSON))
		);
		json.fee_lines = await this.populate('feeLines').then((items) =>
			Promise.all(invokeMap(items, toRestApiJSON))
		);
		json.shipping_lines = await this.populate('shippingLines').then((items) =>
			Promise.all(invokeMap(items, toRestApiJSON))
		);

		unset(json, 'lineItems');
		unset(json, 'feeLines');
		unset(json, 'shippingLines');
	}

	// reverse camelCase for WC REST API
	forEach(json, (data, key) => {
		const privateProperties = ['_id', '_attachments', '_rev'];
		const snakeCaseKey = snakeCase(key);
		if (!privateProperties.includes(key) && key !== snakeCaseKey) {
			json[snakeCaseKey] = data;
			unset(json, key);
		}
	});

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
