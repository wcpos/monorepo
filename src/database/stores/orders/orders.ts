import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import difference from 'lodash/difference';
import unset from 'lodash/unset';
import schema from './schema.json';

export type Schema = import('./interface').WooCommerceOrderSchema;
export type Methods = {};
export type Model = import('rxdb').RxDocument<Schema, Methods>;
export type Statics = {};
export type Collection = import('rxdb').RxCollection<Model, Methods, Statics>;
type Database = import('../../database').Database;

/**
 * WooCommerce Product Model methods
 */
const methods: Methods = {
	/**
	 *
	 */
	async addOrUpdateLineItem(product) {
		await this.collections()
			.line_items.upsert({
				id: `new-${Date.now()}`,
				order_id: this.id,
				name: product.name,
				product_id: parseInt(product.id, 10),
				quantity: 1,
				price: parseInt(product.price, 10),
				sku: product.sku,
				tax_class: product.tax_class,
			})
			.then((newLineItem) => {
				this.update({
					$push: {
						line_items: newLineItem.id,
					},
				});
			});
	},

	/**
	 *
	 */
	async computedSubtotal() {},
};

/**
 * WooCommerce Product Collection methods
 */
const statics: Statics = {
	/**
	 *
	 */
};

/**
 *
 * @param db
 */
const createOrdersCollection = async (db: Database): Promise<Collection> => {
	const OrdersCollection = await db.collection({
		name: 'orders',
		schema,
		methods,
		statics,
	});

	// @TODO - turn this into a plugin?
	OrdersCollection.preInsert(function (rawData) {
		// remove _links property (invalid property name)
		unset(rawData, '_links');

		// change id to string
		rawData.id = String(rawData.id);

		// remove propeties not on schema
		const omitProperties = difference(Object.keys(rawData), this.schema.topLevelFields);
		if (omitProperties.length > 0) {
			console.log('the following properties are being omiited', omitProperties);
			omitProperties.forEach((prop) => {
				unset(rawData, prop);
			});
		}

		// bulkInsert line items
		this.collections().line_items.bulkInsertFromOrder(rawData.line_items, rawData.id);

		// extract line_item ids
		rawData.line_items = rawData.line_items.map((line_item) => String(line_item.id));
	}, false);

	return OrdersCollection;
};

export default createOrdersCollection;
