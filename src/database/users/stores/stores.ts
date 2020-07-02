import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, map, filter, tap } from 'rxjs/operators';
import schema from './schema.json';
import getDatabase from '../../adapter';
import createCollectionMap from '../../stores';
import initialUi from '../ui-settings/initial.json';

export type Schema = import('./interface').WooCommercePOSStoreSchema;
export type Methods = {};
export type Model = import('rxdb').RxDocument<Schema, Methods>;
export type Statics = {};
export type Collection = import('rxdb').RxCollection<Model, Methods, Statics>;
type Database = import('../../database').Database;

/**
 * WordPress User Model methods
 */
const methods: Methods = {
	/**
	 *
	 */
	getUiResource() {
		return this.uiResource;
	},

	/**
	 *
	 */
	getDataResource(type) {
		return this.dataResources[type];
	},
};

/**
 * WordPress User Collection methods
 */
const statics: Statics = {};

/**
 *
 * @param db
 */
const createStoresCollection = async (db: Database): Promise<Collection> => {
	const StoresCollection = await db.collection({
		name: 'stores',
		schema,
		methods,
		statics,
	});

	StoresCollection.postCreate((raw, model) => {
		const storeDatabase = getDatabase(model.id).then((db) =>
			Promise.all(
				createCollectionMap.map((createCollection) => {
					return createCollection(db);
				})
			).then((values) => {
				console.log(values);
				console.log(db);
				return db;
			})
		);
		const query = model.collections().ui_settings.findOne().where('section').eq('pos_products');

		const dbResource = new ObservableResource(from(storeDatabase));

		const dataResources = {
			products: new ObservableResource(
				from(storeDatabase).pipe(switchMap((db) => db.collections.products.find().$))
			),
		};

		// @TODO - move uiResources to the ui settings collection?
		const uiResource = new ObservableResource(
			query.$.pipe(
				filter((ui) => {
					if (!ui) {
						model
							.collections()
							.ui_settings.upsert({ id: 'pos_products-0', section: 'pos_products' });
						return false;
					}
					return true;
				}),
				tap((result) => console.log('UI found from Store Model', result))
			)
		);

		Object.defineProperty(model, 'dbResource', {
			get: () => dbResource,
		});

		Object.defineProperty(model, 'uiResource', {
			get: () => uiResource,
		});

		Object.defineProperty(model, 'dataResources', {
			get: () => dataResources,
		});
	});

	return StoresCollection;
};

export default createStoresCollection;
