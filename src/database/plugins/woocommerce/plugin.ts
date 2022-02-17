import { auditRestApiIds } from './audit-ids';
import { parseRestResponse } from './parse-rest-response';

type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxCollection = import('rxdb/dist/types').RxCollection;

/**
 *
 */
function isSynced(this: RxCollection) {
	return !!this.date_created;
}

/**
 * Helper functions to parse WooCommerce data
 */
export const WoocommercePlugin: RxPlugin = {
	name: 'woocommerce-plugin',
	rxdb: true, // this must be true so rxdb knows that this is a rxdb-plugin and not a pouchdb-plugin

	/**
	 * every value in this object can manipulate the prototype of the keynames class
	 * You can manipulate every prototype in this list:
	 * @link https://github.com/pubkey/rxdb/blob/master/src/plugin.ts#L22
	 */
	prototypes: {
		RxCollection: (proto: any) => {
			// proto.syncRestApi = syncRestApiCollection;
			// proto.bulkUpsertFromServer = bulkUpsertFromServer;
			proto.auditRestApiIds = auditRestApiIds;
			proto.parseRestResponse = parseRestResponse;
		},
		RxDocument: (proto: any) => {
			// proto.syncRestApi = syncRestApiDocument;
			// proto.toRestApiJSON = toRestApiJSON;
			proto.isSynced = isSynced;
		},
	},

	/**
	 * some methods are static and can be overwritten in the overwriteable-object
	 */
	overwritable: {},

	/**
	 * you can add hooks to the hook-list
	 * https://github.com/pubkey/rxdb/blob/master/src/hooks.ts
	 */
	hooks: {
		createRxCollection(collection: RxCollection) {
			// Object.assign(collection, { auditRestApiIds });
			collection.preInsert(parseRestResponse, false);
			collection.preSave(parseRestResponse, false);
		},
	},
};
