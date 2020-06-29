import getDatabase from '../database';
import schema from './app-user-schema.json';
import logger from '../../services/logger';

const collection = getDatabase('wcpos_users')
	.then((userDatabase) =>
		userDatabase.collection({
			name: 'app_users',
			schema,
		})
	)
	.catch((err) => {
		logger.error(err);
	});

export default collection;
