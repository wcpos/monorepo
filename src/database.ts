import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { Database } from '@nozbe/watermelondb';
import Models, { schema } from './models';

const adapter = new SQLiteAdapter({
	dbName: 'wcpos',
	schema,
});

const database = new Database({
	adapter,
	modelClasses: Models,
});

export default database;
