import { auditRestApiIds } from './audit-ids';
import { parseRestResponse } from './parse-rest-response';

type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxCollection = import('rxdb/dist/types').RxCollection;
type RxDocument = import('rxdb/dist/types').RxDocument;

/**
 *
 */
function isSynced(this: RxCollection) {
	return !!this.date_modified_gmt;
}

/**
 *
 */
function maybeAddMeta(this: RxCollection, plainData, doc: RxDocument) {
	if (doc._id && doc._id.includes(':')) {
		doc
			.atomicUpdate((oldData) => {
				oldData.meta_data = oldData.meta_data || [];
				oldData.meta_data.push({ key: '_pos', value: doc._id });
				return oldData;
			})
			.catch((err) => {
				console.log(err);
			});
	}
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
		createRxCollection: {
			after({ collection }) {
				// Object.assign(collection, { auditRestApiIds });
				collection.preInsert(parseRestResponse, false);
				collection.preSave(parseRestResponse, false);
				collection.postInsert(maybeAddMeta, false);
			},
		},
	},
};
