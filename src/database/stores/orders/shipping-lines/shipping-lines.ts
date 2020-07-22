import { ObservableResource } from 'observable-hooks';
import { from, combineLatest } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import difference from 'lodash/difference';
import unset from 'lodash/unset';
import sum from 'lodash/sum';
import schema from './schema.json';

export type Schema = import('./interface').WooCommerceOrderShippingLineSchema;
export type Methods = {};
export type Model = import('rxdb').RxDocument<Schema, Methods>;
export type Statics = {};
export type Collection = import('rxdb').RxCollection<Model, Methods, Statics>;
type Database = import('../../../database').Database;

/**
 * WooCommerce Order Shipping Line methods
 */
const methods: Methods = {};

/**
 * WooCommerce Order Shipping Line statics
 */
const statics: Statics = {
	/**
	 *
	 */
	async bulkInsertFromOrder(data: [], orderId: string) {
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
const createShippingLinesCollection = async (db: Database): Promise<Collection> => {
	const ShippingLinesCollection = await db.collection({
		name: 'shipping_lines',
		schema,
		methods,
		statics,
	});

	// @TODO - turn this into a plugin?
	ShippingLinesCollection.preInsert(function (rawData) {
		// remove _links property (invalid property name)
		// unset(rawData, '_links');

		// remove propeties not on schema
		const omitProperties = difference(Object.keys(rawData), this.schema.topLevelFields);
		if (omitProperties.length > 0) {
			console.log('the following properties are being omiited', omitProperties);
			omitProperties.forEach((prop) => {
				unset(rawData, prop);
			});
		}

		// change id to string
		rawData.id = String(rawData.id);
	}, false);

	ShippingLinesCollection.postCreate((raw, model) => {
		// combineLatest(model.quantity$, model.price$).subscribe((val) => {
		// 	model.atomicSet('total', String(val[0] * val[1]));
		// });
	});

	return ShippingLinesCollection;
};

export default createShippingLinesCollection;
