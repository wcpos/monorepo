import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { Database } from '@nozbe/watermelondb';
import Models, { schema } from './models';

const adapter = new LokiJSAdapter({
  dbName: 'wcpos',
  schema,
});

const database = new Database({
  adapter,
  // @ts-ignore
  modelClasses: Models,
});

export default database;
