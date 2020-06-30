import schema from './schema.json';

type LogSchema = import('./interface').LogSchema;
export type LogModel = import('rxdb').RxDocument<LogSchema, unknown>;
export type LogsCollection = import('rxdb').RxCollection<LogModel, unknown, unknown>;
type Database = import('../../database').Database;

const createLogsCollection = async (db: Database): Promise<LogsCollection> => {
	const logCollection = await db.collection({
		name: 'logs',
		schema,
		methods: {},
		statics: {},
	});

	return logCollection;
};

export default createLogsCollection;
