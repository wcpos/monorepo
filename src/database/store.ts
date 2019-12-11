import { Database, appSchema, tableSchema } from '@nozbe/watermelondb';
import hash from 'hash-sum';
import Adapter from './adapter';
import { modelClasses, schemas } from './models/store';

type Props = {
	site?: string;
	user?: string;
	store?: string;
};

const store = (obj: Props) => {
	if (!obj.site || !obj.user) {
		return;
	}

	const dbName = hash(obj);

	const adapter = new Adapter({
		dbName,
		schema: appSchema({
			version: 25,
			tables: schemas.map(tableSchema),
		}),
	});

	const database = new Database({
		adapter,
		modelClasses,
		actionsEnabled: true,
	});

	return database;
};

export default store;
