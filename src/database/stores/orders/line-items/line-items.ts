import { ObservableResource } from 'observable-hooks';
import { from, combineLatest } from 'rxjs';
import { switchMap, map, tap } from 'rxjs/operators';
import difference from 'lodash/difference';
import unset from 'lodash/unset';
import sum from 'lodash/sum';
import schema from './schema.json';
import preInsert from './preInsert';
import postCreate from './postCreate';
import methods from './methods';
import statics from './statics';

export type Schema = import('./interface').WooCommerceOrderLineItemSchema;
export type Methods = {};
export type Model = import('rxdb').RxDocument<Schema, Methods>;
export type Statics = {};
export type Collection = import('rxdb').RxCollection<Model, Methods, Statics>;
type Database = import('../../../database').Database;

/**
 *
 * @param db
 */
const createLineItemsCollection = async (db: Database): Promise<Collection> => {
	const collections = await db.addCollections({
		line_items: {
			schema,
			// pouchSettings: {},
			statics,
			methods,
			// attachments: {},
			// options: {},
			// migrationStrategies: {},
			// autoMigrate: true,
			// cacheReplacementPolicy() {},
		},
	});

	collections.line_items.preInsert(preInsert, false);
	collections.line_items.postCreate(postCreate);

	return collections.line_items;
};

export default createLineItemsCollection;
