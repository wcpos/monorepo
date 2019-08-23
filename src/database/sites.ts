import { Database, appSchema, tableSchema } from '@nozbe/watermelondb';
import Adapter from './adapter';
import Site from './models/site';
import User from './models/user';
import Store from './models/user';
import siteSchema from './models/site.schema';
import userSchema from './models/user.schema';
import storeSchema from './models/store.schema';

const adapter = new Adapter({
	dbName: 'wcpos-sites',
	schema: appSchema({
		version: 2,
		tables: [tableSchema(siteSchema), tableSchema(userSchema), tableSchema(storeSchema)],
	}),
});

const database = new Database({
	adapter,
	modelClasses: [Site, User, Store],
	actionsEnabled: true,
});

export default database;
