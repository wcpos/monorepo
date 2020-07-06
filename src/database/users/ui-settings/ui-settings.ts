import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, map, filter, tap, switchMapTo, share, mergeMap } from 'rxjs/operators';
import schema from './schema.json';
import initialUI from './initial.json';

export type Schema = import('./interface').UISettingsSchema;
export type Methods = {};
export type Model = import('rxdb').RxDocument<Schema, Methods>;
export type Statics = {};
export type Collection = import('rxdb').RxCollection<Model, Methods, Statics>;
type Database = import('../../database').Database;

/**
 * UI Settings Model methods
 */
const methods: Methods = {
	/**
	 *
	 */
	reset() {
		if (initialUI.hasOwnProperty(this.section)) {
			this.update({ $set: initialUI[this.section] });
		}
	},

	/**
	 *
	 */
	async updateColumn(key, payload) {
		await this.atomicSet(
			'columns',
			this.columns.map((column) => {
				if (key === column.key) {
					return { ...column, ...payload };
				}
				return column;
			})
		);
	},

	/**
	 *
	 */
	async updateDisplay(key, payload) {
		await this.atomicSet(
			'display',
			this.display.map((d) => {
				if (key === d.key) {
					return { ...d, ...payload };
				}
				return d;
			})
		);
	},

	/**
	 *
	 */
	async updateWidth() {
		await this.update({ $set: { width: '40% ' } });
	},
};

/**
 * UI Settings Collection methods
 */
const statics: Statics = {
	/**
	 *
	 */
	getUiSetting$(store_id, section) {
		const query = this.findOne().where({ store_id }).where({ section });
		return query.$.pipe(
			filter((ui) => {
				if (!ui) {
					this.insert({ id: `${store_id}-${section}`, store_id, section, ...initialUI[section] });
					return false;
				}
				return true;
			}),
			tap((result) => console.log('UI found from Store Model', result))
		);
	},
};

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
