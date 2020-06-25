import { Database, appSchema, tableSchema } from '@nozbe/watermelondb';
import { Platform } from 'react-native';
import Adapter from './adapter';
import { modelClasses, schemas } from './models/auth';

// @TODO: change to wcpos-auth

const config = {
	dbName: 'wcpos-auth',
	schema: appSchema({
		version: 2,
		tables: schemas.map(tableSchema),
	}),
};

if (Platform.OS === 'web') {
	config.useWebWorker = false;
	config.useIncrementalIndexedDB = true;
	// It's recommended you implement this method:
	// config.onIndexedDBVersionChange = () => {
	// database was deleted in another browser tab (user logged out), so we must make sure we delete
	// it in this tab as well
	// if (checkIfUserIsLoggedIn() {
	// window.location.reload();
	// }
	// };
}

const database = new Database({
	adapter: new Adapter(config),
	modelClasses,
	actionsEnabled: true,
});

export default database;
