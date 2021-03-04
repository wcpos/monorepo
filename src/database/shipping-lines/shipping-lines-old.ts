import { ObservableResource } from 'observable-hooks';
import { from, combineLatest } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import difference from 'lodash/difference';
import unset from 'lodash/unset';
import sum from 'lodash/sum';
import schema from './schema.json';

type StoreDatabase = import('../../../types').StoreDatabase;
type OrderShippingLineDocument = import('../../../types').OrderShippingLineDocument;

/**
 * WooCommerce Order Shipping Line methods
 */
export const methods = {};

/**
 * WooCommerce Order Shipping Line statics
 */
export const statics = {
	/**
	 *
	 */
	async bulkInsertFromOrder(
		this: OrderShippingLineDocument,
		data: Record<string, unknown>[],
		orderId: string
	) {
		this.bulkInsert(
			data.map((d) => {
				d.order_id = orderId;
				return d;
			})
		);
	},
};

/**
 *
 * @param db
 */
const createShippingLinesCollection = async (db: StoreDatabase) => {
	const collections = await db.addCollections({
		shipping_lines: {
			schema,
			// pouchSettings: {},
			statics,
			methods,
			// attachments: {},
			// options: {},
			// migrationStrategies: {},
			// autoMigrate: true,
			// cacheReplacementPolicy() {},
		},
	});

	// @TODO - turn this into a plugin?
	collections.shipping_lines.preInsert((rawData: Record<string, unknown>) => {
		// remove _links property (invalid property name)
		// unset(rawData, '_links');

		// remove propeties not on schema
		// const omitProperties = difference(Object.keys(rawData), this.schema.topLevelFields);
		// if (omitProperties.length > 0) {
		// 	console.log('the following properties are being omiited', omitProperties);
		// 	omitProperties.forEach((prop) => {
		// 		unset(rawData, prop);
		// 	});
		// }

		// change id to string
		rawData.id = String(rawData.id);
	}, false);

	// ShippingLinesCollection.postCreate((raw, model) => {
	// combineLatest(model.quantity$, model.price$).subscribe((val) => {
	// 	model.atomicSet('total', String(val[0] * val[1]));
	// });
	// });

	return collections.shipping_lines;
};

export default createShippingLinesCollection;
