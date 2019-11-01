import { Model } from '@nozbe/watermelondb';
import { field, json, nochange, date, immutableRelation } from '@nozbe/watermelondb/decorators';

export default class Image extends Model {
	static table = 'images';

	static associations = {
		products: { type: 'belongs_to', key: 'parent_id' },
	};

	@immutableRelation('products', 'parent_id') parent!: any;

	@nochange @field('remote_id') remote_id!: number;
	@date('date_created') date_created!: string;
	@date('date_created_gmt') date_created_gmt!: string;
	@date('date_modified') date_modified!: string;
	@date('date_modified_gmt') date_modified_gmt!: string;
	@field('src') description!: string;
	@field('name') name!: string;
	@field('alt') slug!: string;
}
