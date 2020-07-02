import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import schema from './schema.json';

export type Schema = import('./interface').UISettingsSchema;
export type Methods = {};
export type Model = import('rxdb').RxDocument<Schema, Methods>;
export type Statics = {};
export type Collection = import('rxdb').RxCollection<Model, Methods, Statics>;
type Database = import('../../database').Database;

/**
 * WordPress User Model methods
 */
const methods: Methods = {};

/**
 * WordPress User Collection methods
 */
const statics: Statics = {};

/**
 *
 * @param db
 */
const createUiSettingsCollection = async (db: Database): Promise<Collection> => {
	const UiSettingsCollection = await db.collection({
		name: 'ui_settings',
		schema,
		methods,
		statics,
	});

	// UiSettingsCollection.postCreate((raw, model) => {
	// 	const dbResource = new ObservableResource(
	// 		from(
	// 			getDatabase(model.id).then((db) => {
	// 				console.log(db);
	// 			})
	// 		)
	// 	);
	// 	Object.defineProperty(model, 'dbResource', {
	// 		get: () => dbResource,
	// 	});
	// });

	return UiSettingsCollection;
};

export default createUiSettingsCollection;
