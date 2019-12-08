import { field, nochange } from '@nozbe/watermelondb/decorators';
import Model from '../base';

export interface RefundInterface {
	remote_id: number;
	reason: string;
	total: string;
}

export default class Refund extends Model implements RefundInterface {
	static table = 'refunds';

	static associations = {
		orders: { type: 'belongs_to', key: 'order_id' },
	};

	@nochange @field('remote_id') remote_id;
	@field('reason') reason;
	@field('total') total;
}
