import { field, nochange } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import { children } from '../decorators';

export interface CouponLineInterface {
	remote_id: number;
	code: string;
	discount: string;
	discount_tax: string;
	meta_data: import('./meta').MetaDataInterface[];
}

export default class CouponLine extends Model implements CouponLineInterface {
	static table = 'coupon_lines';

	static associations = {
		orders: { type: 'belongs_to', key: 'order_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id;
	@field('code') code;
	@field('discount') discount;
	@field('discount_tax') discount_tax;
	@children('meta') meta_data;
}
