import { field, nochange, json, immutableRelation } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import Model from '../base';
import { children } from '../decorators';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;
type MetaData = typeof import('./meta');
type MetaDataQuery = import('@nozbe/watermelondb').Query<MetaData>;
type Tax = typeof import('./tax');
type TaxQuery = import('@nozbe/watermelondb').Query<Tax>;

/**
 * Line Item Schema
 *
 */
export const lineItemSchema: Schema = {
	name: 'line_items',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true, isOptional: true },
		{ name: 'order_id', type: 'string', isIndexed: true },
		{ name: 'name', type: 'string' },
		{ name: 'product_id', type: 'number' },
		{ name: 'variation_id', type: 'number' },
		{ name: 'quantity', type: 'number' },
		{ name: 'tax_class', type: 'string' },
		{ name: 'subtotal', type: 'string' },
		{ name: 'subtotal_tax', type: 'string' },
		{ name: 'total', type: 'string' },
		{ name: 'total_tax', type: 'string' },
		{ name: 'sku', type: 'string' },
		{ name: 'price', type: 'number' },
	],
};

/**
 * Line Item Model
 *
 */
class LineItem extends Model {
	static table = 'line_items';

	static associations: Associations = {
		orders: { type: 'belongs_to', key: 'order_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
		taxes: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@immutableRelation('orders', 'order_id') order!: any;

	@nochange @field('remote_id') remote_id!: number;
	@nochange @field('product_id') product_id!: number;
	@nochange @field('variation_id') variation_id!: number;
	@field('name') name!: string;
	@field('quantity') quantity!: number;
	@field('tax_class') tax_class!: string;
	@field('subtotal') subtotal!: string;
	@field('subtotal_tax') subtotal_tax!: string;
	@field('total') total!: string;
	@field('total_tax') total_tax!: string;
	@children('taxes') taxes!: TaxQuery;
	@children('meta') meta_data!: MetaDataQuery;
	@field('sku') sku!: string;
	@field('price') price!: number;

	/** */
	get calculatedTotal() {
		return this.quantity * this.price;
	}

	// /** */
	// setMetaData(array: []) {
	// 	const add = array.map((json: any) => {
	// 		return this.meta_data.collection.prepareCreate((m: OrderLineItem) => {
	// 			m.parent_id = this.id;
	// 			m.set(json);
	// 		});
	// 	});
	// 	return this.batch(...add);
	// }

	// /** */
	// setTaxes(array: []) {
	// 	const add = array.map((json: any) => {
	// 		return this.taxes.collection.prepareCreate((m: OrderLineItem) => {
	// 			m.parent_id.set(this);
	// 			m.set(json);
	// 		});
	// 	});
	// 	return this.batch(...add);
	// }

	/** */
	async split() {
		const dupe = Math.ceil(this.quantity - 1);
		if (dupe > 0) {
			const batch = [
				this.prepareUpdate(() => {
					this.quantity -= dupe;
				}),
			];
			for (let i = 0; i < dupe; i++) {
				batch.push(
					this.collection.prepareCreate((model: OrderLineItem) => {
						// model.order.id = this.order.id;
						model.order.set(this.order);
						model.quantity = 1;
						model.name = this.name;
						model.product_id = this.product_id;
						model.variation_id = this.variation_id;
						model.tax_class = this.tax_class;
						model.meta_data = this.meta_data;
						model.sku = this.sku;
						model.price = this.price;
					})
				);
			}
			// @ts-ignore
			await this.batch(batch);
		}
	}
}

export default LineItem;
