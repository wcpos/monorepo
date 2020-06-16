import { Q } from '@nozbe/watermelondb';
import { field, children } from '@nozbe/watermelondb/decorators';
import { ObservableResource } from 'observable-hooks';
import Model from '../base';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

/**
 * User Schema
 *
 */
export const userSchema: Schema = {
	name: 'users',
	columns: [
		{ name: 'first_name', type: 'string' },
		{ name: 'last_name', type: 'string' },
		{ name: 'display_name', type: 'string' },
	],
};

/**
 * User Model
 *
 */
class User extends Model {
	static table = 'users';

	static associations = {
		sites: { type: 'has_many', foreignKey: 'parent_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
	};

	private _sitesResource: ObservableResource<unknown, unknown>;

	constructor(collection, raw) {
		super(collection, raw);
		this._sitesResource = new ObservableResource(this.sites.observe());
	}

	@children('sites') sites!: any;

	@field('first_name') first_name!: string;
	@field('last_name') last_name!: string;
	@field('display_name') display_name!: string;
	@children('meta') meta!: {};

	get sitesResource() {
		return this._sitesResource;
	}
}

export default User;
