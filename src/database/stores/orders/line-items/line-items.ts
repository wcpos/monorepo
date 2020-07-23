import { ObservableResource } from 'observable-hooks';
import { from, combineLatest } from 'rxjs';
import { switchMap, map, tap } from 'rxjs/operators';
import difference from 'lodash/difference';
import unset from 'lodash/unset';
import sum from 'lodash/sum';
import schema from './schema.json';

export type Schema = import('./interface').WooCommerceOrderLineItemSchema;
export type Methods = {};
export type Model = import('rxdb').RxDocument<Schema, Methods>;
export type Statics = {};
export type Collection = import('rxdb').RxCollection<Model, Methods, Statics>;
type Database = import('../../../database').Database;

/**
 * WooCommerce Order Line Item methods
 */
const methods: Methods = {
	/**
	 *
	 */
	computedTotal() {
		return this.quantity * this.price;
	},
	/**
	 *
	 */
	computedSubtotal() {
		return this.quantity * this.price;
	},
};

/**
 * WooCommerce Order Line Item statics
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
const createLineItemsCollection = async (db: Database): Promise<Collection> => {
	const LineItemsCollection = await db.collection({
		name: 'line_items',
		schema,
		methods,
		statics,
	});

	// @TODO - turn this into a plugin?
	LineItemsCollection.preInsert(function (rawData) {
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

	LineItemsCollection.postCreate((raw, model) => {
		combineLatest(model.quantity$, model.price$)
			.pipe(tap((res) => console.log(res)))
			.subscribe((val) => {
				model.atomicSet('total', String(val[0] * val[1]));
			});
	});

	return LineItemsCollection;
};

export default createLineItemsCollection;
