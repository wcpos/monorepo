import isEmpty from 'lodash/isEmpty';
import map from 'lodash/map';
import pickBy from 'lodash/pickBy';
import { flatClone } from 'rxdb';

import schema from './schema.json';

export type OrderSchema = import('./interface').WooCommerceOrderSchema;
export type OrderDocument = import('rxdb').RxDocument<OrderSchema, OrderMethods>;
export type OrderCollection = import('rxdb').RxCollection<
	OrderDocument,
	OrderMethods,
	OrderStatics
>;

type OrderMethods = Record<string, never>;
type OrderStatics = Record<string, never>;

/**
 * Get children props from the schema
 * NOTE - this returns an object, not any array
 */
function getPropsWithRef(properties: Record<string, any>) {
	return pickBy(properties, (property) => !!property?.ref);
}

/**
 *
 *
 * @param this
 * @returns
 */
function toPopulatedOrderJSON(this: OrderDocument) {
	const collections = this.collection.database.collections;
	const childrenProps = getPropsWithRef(this.collection.schema.jsonSchema.properties);
	const latestDoc = this.getLatest();

	// if there are no children, return plain json
	if (isEmpty(childrenProps)) return Promise.resolve(latestDoc.toJSON());

	// get json and populate children
	const json = latestDoc.toMutableJSON();
	const childrenPromises = map(childrenProps, async (object, key) => {
		/**
		 * populate the child docs, inluding items that are _deleted = true
		 * TODO - do we need to do a toPopulatedJSON() on each child doc?
		 */
		const refCollection = collections[key];
		const childDocsData = await refCollection.storageInstance.findDocumentsById(json[key], true);
		json[key] = Object.values(childDocsData).map((docData) => {
			const data = flatClone(docData);
			/**
			 * If deleted, we null out some data via the WC REST API item_is_null helper
			 * currently at; /includes/rest-api/Controllers/Version2/class-wc-rest-orders-v2-controller.php#L1020
			 */
			if (data._deleted) {
				if ('product_id' in data) {
					data.product_id = null;
				}
				if ('method_id' in data) {
					data.method_id = null;
				}
				if ('method_title' in data) {
					data.method_title = null;
				}
				if ('name' in data) {
					data.name = null;
				}
				if ('code' in data) {
					data.code = null;
				}
			}

			/**
			 * This is another hack for deleted meta data:
			 * 1. we make the key = '_deleted', this will hide it in the POS
			 * 2. we set the value to null, this will delete it in the WC REST API
			 */
			if (Array.isArray(data.meta_data) && data.meta_data.length > 0) {
				data.meta_data = data.meta_data.map((meta) => {
					if (meta.id && meta.key === '_deleted') {
						// meta is frozen so we need to clone it
						meta = { ...meta, value: null };
					}
					return meta;
				});
			}

			/**
			 * Matches rxdb toJSON() behaviour
			 */
			delete (data as any)._rev;
			delete (data as any)._attachments;
			delete (data as any)._deleted;
			delete (data as any)._meta;
			return data;
		});

		// const childDocs = await latestDoc.populate(key);
		// const childPromises = childDocs.map(async (doc) => {
		// 	return await doc.toPopulatedJSON();
		// });
		// json[key] = await Promise.all(childPromises);
	});

	return Promise.all(childrenPromises).then(() => json);
}

/**
 *
 */
export const orders = {
	schema,
	localDocuments: true, // needed for custom checkpoint
	methods: {
		toPopulatedOrderJSON,
	},
	options: {
		searchFields: ['number', 'billing.first_name', 'billing.last_name', 'billing.email'],
	},
};
