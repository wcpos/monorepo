import { Database, appSchema, tableSchema } from '@nozbe/watermelondb';
import Adapter from './adapter';
import modelClasses from './models/sites';
import schemas from './schemas/sites';

const adapter = new Adapter({
	dbName: 'wcpos-sites',
	schema: appSchema({
		version: 2,
		tables: schemas.map(tableSchema),
	}),
});

const database = new Database({
	adapter,
	modelClasses,
	actionsEnabled: true,
});

export default database;
