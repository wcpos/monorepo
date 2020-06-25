import getDatabase from '../database';
import schema from './log-schema.json';

const collection = getDatabase('wcpos_users').then((userDatabase) =>
	userDatabase.collection({
		name: 'logs',
		schema,
	})
);

export default collection;
