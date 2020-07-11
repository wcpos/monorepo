import { ObservableResource } from 'observable-hooks';
import { switchMap, map } from 'rxjs/operators';
import schema from './schema.json';

type WpUserSchema = import('./interface').WordPressUserSchema;
type WpUserModelMethods = {};
type WpUserModel = import('rxdb').RxDocument<WpUserSchema, WpUserModelMethods>;
type WpUserCollectionMethods = {};
export type WpUsersCollection = import('rxdb').RxCollection<
	WpUserModel,
	WpUserModelMethods,
	WpUserCollectionMethods
>;
type Database = import('../../database').Database;

/**
 * WordPress User Model methods
 */
const methods: WpUserModelMethods = {};

/**
 * WordPress User Collection methods
 */
const statics: WpUserCollectionMethods = {};

/**
 *
 * @param db
 */
const createWpUsersCollection = async (db: Database): Promise<WpUsersCollection> => {
	const WpUsersCollection = await db.collection({
		name: 'wp_users',
		schema,
		methods,
		statics,
		options: {
			foo: 'bar',
		},
	});

	// WpUsersCollection.postCreate((plainData, rxDocument) => {

	// });

	return WpUsersCollection;
};

export default createWpUsersCollection;
