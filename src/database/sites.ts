import { Database, appSchema, tableSchema } from '@nozbe/watermelondb';
import { Platform } from 'react-native';
import Adapter from './adapter';
import { modelClasses, schemas } from './models/sites';

const config = {
	dbName: 'wcpos-sites',
	schema: appSchema({
		version: 3,
		tables: schemas.map(tableSchema),
	}),
};

if (Platform.OS === 'web') {
	config.useWebWorker = true;
	config.useIncrementalIndexedDB = false;
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
