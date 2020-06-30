import schema from './schema.json';

const createLogsCollection = async (db) => {
	const logCollection = await db.collection({
		name: 'logs',
		schema,
		methods: {},
		statics: {},
	});

	return logCollection;
};

export default createLogsCollection;
