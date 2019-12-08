import { field, nochange } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import { children } from '../decorators';

export default class ShippingLine extends Model {
	static table = 'shipping_lines';

	static associations = {
		orders: { type: 'belongs_to', key: 'order_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
		taxes: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id!: number;
	@field('method_title') method_title!: string;
	@field('method_id') method_id!: string;
	@field('total') total!: string;
	@field('tax_total') tax_total!: string;
	@field('shipping_tax_total') shipping_tax_total!: string;
	@children('taxes') taxes!: any;
	@children('meta') meta_data!: any;
}
