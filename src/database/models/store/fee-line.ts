import { field, nochange } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import { children } from '../decorators';

export interface FeeLineInterface {
	remote_id: number;
	name: string;
	tax_class: string;
	tax_status: string;
	total: string;
	tax_total: string;
	taxes: import('./tax').TaxInterface[];
	meta_data: import('./meta').MetaDataInterface[];
}

export default class FeeLine extends Model implements FeeLineInterface {
	static table = 'fee_lines';

	static associations = {
		orders: { type: 'belongs_to', key: 'order_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
		taxes: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id;
	@field('name') name;
	@field('tax_class') tax_class;
	@field('tax_status') tax_status;
	@field('total') total;
	@field('tax_total') tax_total;
	@children('taxes') taxes;
	@children('meta') meta_data;
}
