import { field, nochange } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import { children } from '../decorators';

export interface TaxInterface {
	remote_id: number;
	rate_code: string;
	rate_id: string;
	label: string;
	compound: string;
	tax_total: string;
	shipping_tax_total: string;
	meta_data: import('./meta').MetaDataInterface[];
}

export default class Tax extends Model {
	static table = 'taxes';

	static associations = {
		orders: { type: 'belongs_to', key: 'parent_id' },
		shipping_lines: { type: 'belongs_to', key: 'parent_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id;
	@field('rate_code') rate_code;
	@field('rate_id') rate_id;
	@field('label') label;
	@field('compound') compound;
	@field('tax_total') tax_total;
	@field('shipping_tax_total') shipping_tax_total;
	@children('meta') meta_data;
}
