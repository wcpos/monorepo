import { field, nochange } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import { date } from '../decorators';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

export const orderNoteSchema: Schema = {
	name: 'order_notes',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'order_id', type: 'string', isIndexed: true },
		{ name: 'author', type: 'string' },
		{ name: 'date_created', type: 'string' },
		{ name: 'date_created_gmt', type: 'string' },
		{ name: 'note', type: 'boolean' },
		{ name: 'customer_note', type: 'boolean' },
		{ name: 'added_by_user', type: 'boolean' },
	],
};

export default class OrderNote extends Model {
	static table = 'order_notes';

	static associations = {
		orders: { type: 'belongs_to', key: 'order_id' },
	};

	@nochange @field('remote_id') remote_id;
	@field('author') author!: string;
	@date('date_created') date_created!: Date;
	@date('date_created_gmt') date_created_gmt!: Date;
	@field('note') note!: string;
	@field('customer_note') customer_note!: boolean;
	@field('added_by_user') added_by_user!: boolean;
}
