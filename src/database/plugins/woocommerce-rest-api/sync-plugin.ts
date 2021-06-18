import forEach from 'lodash/forEach';
import { syncRestApiCollection } from './sync-collection';
import { syncRestApiDocument } from './sync-document';
import { toRestApiJSON } from './to-json';
import { bulkUpsertFromServer } from './bulk-upsert';
import { auditIdsFromServer } from './audit-ids';

import { parsePlainData } from './helpers';

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
const prototypes = {
	RxCollection: (proto: any) => {
		proto.syncRestApi = syncRestApiCollection;
		proto.bulkUpsertFromServer = bulkUpsertFromServer;
		proto.auditIdsFromServer = auditIdsFromServer;
	},
	RxDocument: (proto: any) => {
		proto.syncRestApi = syncRestApiDocument;
		proto.toRestApiJSON = toRestApiJSON;
	},
};

/**
 *
 */
const hooks = {
	createRxCollection(collection: RxCollection) {
		/**
		 * Parse plaindata on insert and save
		 */
		collection.preInsert(parsePlainData, false);
		collection.preSave(parsePlainData, false);

		/**
		 * Add _posLocalId to meta if no id
		 */
		collection.postInsert(function maybeAddMeta(
			this: RxCollection,
			plainData: Record<string, unknown>,
			document: RxDocument
		) {
			// @ts-ignore
			if (!document.id) {
				document.update({
					$push: {
						// @ts-ignore
						metaData: { key: '_pos', value: document._id },
					},
				});
			}
		},
		false);

		/**
		 * Allow colections to set middleware-hooks via config options
		 * needs to allow for promises
		 */
		forEach(collection.options.middlewares, (middleware, hook) => {
			const { handle, parallel } = middleware;
			collection[hook](handle, parallel);
		});

		return collection;
	},
};

export const RxDBWooCommerceRestApiSyncPlugin: RxPlugin = {
	name: 'woocommerce-rest-api-sync',
	rxdb: true,
	prototypes,
	hooks,
};
