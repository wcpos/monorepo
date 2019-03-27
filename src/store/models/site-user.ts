import { field } from '@nozbe/watermelondb/decorators';
import Model from './base';

/**
 * Pivot model for Sites <-> Users
 * https://github.com/Nozbe/WatermelonDB/blob/master/docs/Relation.md#many-to-many-relation
 */
class SiteUser extends Model {
	static table = 'site_users';

	static associations = {
		sites: { type: 'belongs_to', key: 'site_id' },
		users: { type: 'belongs_to', key: 'user_id' },
	};

	@field('site_id') site_id!: string;
	@field('user_id') user_id!: string;
}

export default SiteUser;
