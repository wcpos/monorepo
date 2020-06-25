import { field, nochange, immutableRelation, children } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import { Q } from '@nozbe/watermelondb';
import { filter, map, tap } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import Model from '../base';
import getStoreDatabase from '../../store';
import initialUi from './ui/initial.json';
import { syncIds } from '../../../services/wc-api';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;
type Database = import('@nozbe/watermelondb').Database;
type UiKeys = Extract<keyof typeof initialUi, string>;
type UI = typeof import('./ui/ui');

const TABLE_NAME = 'stores';

/**
 * Store Schema
 *
 */
export const storeSchema: Schema = {
	name: TABLE_NAME,
	columns: [
		{ name: 'remote_id', type: 'string', isIndexed: true },
		{ name: 'app_user_id', type: 'string', isIndexed: true },
		{ name: 'wp_user_id', type: 'string', isIndexed: true },
		{ name: 'name', type: 'string' },
	],
};

/**
 * Store Model
 *
 */
class Store extends Model {
	static table = TABLE_NAME;

	static associations: Associations = {
		app_users: { type: 'belongs_to', key: 'app_user_id' },
		wp_users: { type: 'belongs_to', key: 'wp_user_id' },
		uis: { type: 'has_many', foreignKey: 'store_id' },
	};

	private _db;
	private _uiResources = {};
	private _dataResources = {};

	constructor(collection, raw) {
		super(collection, raw);
		this._db = getStoreDatabase(this.id);

		const uiCollection = this.collections.get('uis');

		const sections = ['pos_products', 'products'];

		sections.map((section) => {
			const init = async () => {
				await this.database.action(async () => {
					const newUI = await uiCollection.create((ui: UI) => {
						ui.section = section;
					});
					newUI.reset();
				});
			};

			const ui$ = uiCollection
				.query(Q.where('section', section))
				.observeWithColumns(['width', 'sortBy', 'sortDirection'])
				.pipe(
					filter((uis: UI[]) => {
						if (uis.length > 0) {
							return true;
						}
						init();
						return false;
					}),
					map((uis: UI[]) => uis[0]),
					tap((result) => console.log('UI found from Store Model', result))
				);

			this._uiResources[section] = new ObservableResource(ui$);
		});
	}

	@immutableRelation('app_users', 'app_user_id') app_user!: any;
	@immutableRelation('wp_users', 'wp_user_id') wp_user!: any;

	@children('uis') uis: any;

	@field('remote_id') remote_id!: number;
	@field('name') name!: string;

	/**
	 * Store Database
	 *
	 * @TODO there is a naming concept clash here .. store.database = wcpos-auth database
	 * @readonly
	 * @memberof Store
	 */
	get db(): Database {
		return this._db;
	}

	/**
	 *
	 * @param key
	 */
	getUiResource(section: UiKeys) {
		return this._uiResources[section];
	}

	/**
	 *
	 * @param type
	 */
	getDataResource(type: 'products' | 'orders') {
		if (!this._dataResources[type]) {
			const dataCollection = this._db.collections.get(type);
			const that = this;
			const init = async () => {
				const wpUser = await that.wp_user.fetch();
				const site = await wpUser.site.fetch();

				syncIds(dataCollection, wpUser, site);
			};

			// @TODO query observable combine with database query
			const data$ = dataCollection
				.query(Q.where('name', Q.like(`%${Q.sanitizeLikeString('')}%`)))
				.observe()
				.pipe(
					filter((data) => {
						if (data.length > 0) {
							return true;
						}
						init();
					})
				);

			this._dataResources[type] = new ObservableResource(data$);
		}
		return this._dataResources[type];
	}
}

export default Store;
