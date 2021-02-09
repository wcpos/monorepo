import { ObservableResource } from 'observable-hooks';
import { from, of, combineLatest } from 'rxjs';
import { switchMap, tap, catchError, map, filter } from 'rxjs/operators';
import difference from 'lodash/difference';
import unset from 'lodash/unset';
import sumBy from 'lodash/sumBy';
import schema from './schema.json';

export type Schema = import('./interface').WooCommerceOrderSchema;
export type Methods = {};
export type Model = import('rxdb').RxDocument<Schema, Methods>;
export type Statics = {};
export type Collection = import('rxdb').RxCollection<Model, Methods, Statics>;
type Database = import('../../database').Database;

/**
 * WooCommerce Order Model methods
 */
const methods: Methods = {
	/**
	 *
	 */
	async addOrUpdateLineItem(product, parent) {
		await this.collections()
			.line_items.upsert({
				id: `new-${Date.now()}`,
				order_id: this.id,
				name: product.name || parent.name,
				product_id: parent ? parseInt(parent.id, 10) : parseInt(product.id, 10),
				variation_id: parent && parseInt(product.id, 10),
				quantity: 1,
				price: parseFloat(product.price),
				sku: product.sku,
				tax_class: product.tax_class,
			})
			.then((newLineItem) => {
				return this.update({
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

	/**
	 *
	 */
	async removeLineItem(lineItem) {
		await this.update({
			$pullAll: {
				line_items: [lineItem.id],
			},
		}).then(() => {
			return lineItem.remove();
		});
	},

	/**
	 *
	 */
	async addFeeLine(data) {
		await this.collections()
			.fee_lines.upsert({ ...data, id: `new-${Date.now()}`, order_id: this.id })
			.then((newFee) => {
				return this.update({
					$push: {
						fee_lines: newFee.id,
					},
				});
			});
	},

	/**
	 *
	 */
	async removeFeeLine(feeLine) {
		await this.update({
			$pullAll: {
				fee_lines: [feeLine.id],
			},
		}).then(() => {
			return feeLine.remove();
		});
	},

	/**
	 *
	 */
	async addShippingLine(data) {
		await this.collections()
			.shipping_lines.upsert({ ...data, id: `new-${Date.now()}`, order_id: this.id })
			.then((newShipping) => {
				return this.update({
					$push: {
						shipping_lines: newShipping.id,
					},
				});
			});
	},

	/**
	 *
	 */
	async removeShippingLine(shippingLine) {
		await this.update({
			$pullAll: {
				shipping_lines: [shippingLine.id],
			},
		}).then(() => {
			return shippingLine.remove();
		});
	},
};

/**
 * WooCommerce Order Collection methods
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
		this.collections().fee_lines.bulkInsertFromOrder(rawData.fee_lines, rawData.id);

		// extract line_item ids
		rawData.line_items = rawData.line_items.map((line_item) => String(line_item.id));
		rawData.fee_lines = rawData.fee_lines.map((fee_line) => String(fee_line.id));
	}, false);

	/**
	 * wire up total
	 */
	OrdersCollection.postCreate((raw, model) => {
		// combineLatest(model.quantity$, model.price$).subscribe((val) => {
		// 	model.atomicSet('total', String(val[0] * val[1]));
		// });

		// @TODO - why does this effect line_item subscriptions?
		model.line_items$
			.pipe(
				switchMap((ids) => from(model.collections().line_items.findByIds(ids))),
				// map((result) => Array.from(result.values())),
				// switchMap((array) => combineLatest(array.map((item) => item.$))),
				switchMap((items) => combineLatest(Array.from(items.values()).map((item) => item.$))),
				catchError((err) => console.error(err))
			)
			.subscribe((lineItems) => {
				const total = String(
					sumBy(lineItems, function (item) {
						return Number(item.total);
					})
				);
				if (total !== model.total) {
					console.log(total);
					model.atomicSet('total', total);
				}

				const total_tax = String(
					sumBy(lineItems, function (item) {
						return Number(item.total_tax);
					})
				);
				if (total_tax !== model.total_tax) {
					console.log(total_tax);
					model.atomicSet('total_tax', total_tax);
				}
			});
	});

	return OrdersCollection;
};

export default createOrdersCollection;
