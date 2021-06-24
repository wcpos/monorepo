import { BehaviorSubject } from 'rxjs';
import { map, debounceTime } from 'rxjs/operators';
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
function isSynced(this: Collection) {
	return !!this.dateCreated;
}

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
		proto.isSynced = isSynced;
	},
};

/**
 *
 */
const hooks = {
	createRxCollection(collection: RxCollection) {
		collection.totalRecords = new BehaviorSubject(0);
		collection.totalRecords$ = collection.totalRecords.asObservable();

		/**
		 * count the total records
		 * */
		collection.pouch
			.find({
				selector: {},
				// @ts-ignore
				fields: ['_id', 'id', 'dateCreatedGmt'],
			})
			.then((result) => {
				console.log(collection.name, result.docs.length);
				collection.totalRecords.next(result.docs.length);
			})
			.catch((err) => {
				console.log(err);
			});

		/**
		 * count the total records
		 * */
		const watch = collection.$.pipe(
			debounceTime(20),
			map(() => {
				collection.pouch
					.find({
						selector: {},
						// @ts-ignore
						fields: ['_id', 'id', 'dateCreatedGmt'],
					})
					.then((result) => {
						console.log(collection.name, result.docs.length);
						collection.totalRecords.next(result.docs.length);
					})
					.catch((err) => {
						console.log(err);
					});
			})
		);
		watch.subscribe();

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
