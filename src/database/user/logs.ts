import getDatabase from '../database';
import schema from './log-schema.json';
import logger from '../../services/logger';

const collection = getDatabase('wcpos_users')
	.then((userDatabase) =>
		userDatabase.collection({
			name: 'logs',
			schema,
		})
	)
	.catch((err) => {
		logger.error(err);
	});

export default collection;
