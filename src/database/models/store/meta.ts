import { field, nochange, json } from '@nozbe/watermelondb/decorators';
import Model from '../base';

export interface MetaDataInterface {
	remote_id: number;
	key: string;
	value: string | {};
}

const sanitizeValue = rawValue => {
	return Array.isArray(rawValue) ? rawValue.map(String) : [];
};

export default class Meta extends Model implements MetaDataInterface {
	static table = 'meta';

	static associations = {
		customers: { type: 'belongs_to', foreignKey: 'parent_id' },
		orders: { type: 'belongs_to', foreignKey: 'parent_id' },
		products: { type: 'belongs_to', foreignKey: 'parent_id' },
		line_items: { type: 'belongs_to', foreignKey: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id;
	@field('key') key;
	@json('value', sanitizeValue) value;
}
