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
		/**
		 * Init Store Database
		 */
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

		/**
		 * Init UI Settings
		 */
		const initUiResource = (section) => {
			return new ObservableResource(
				model.collections().ui_settings.getUiSetting$(model.id, section)
			);
		};

		const uiResources = {
			pos_products: initUiResource('pos_products'),
			pos_cart: initUiResource('pos_cart'),
			products: initUiResource('products'),
			orders: initUiResource('orders'),
			customers: initUiResource('customers'),
		};

		/**
		 * Init Data Resources
		 */
		const dbResource = new ObservableResource(from(storeDatabase));

		const dataResources = {
			products: new ObservableResource(
				from(storeDatabase).pipe(switchMap((db) => db.collections.products.find().$))
			),
		};

		Object.defineProperty(model, 'dbResource', {
			get: () => dbResource,
		});

		Object.defineProperty(model, 'dataResources', {
			get: () => dataResources,
		});

		Object.defineProperty(model, 'uiResources', {
			get: () => uiResources,
		});
	});

	return StoresCollection;
};

export default createStoresCollection;
