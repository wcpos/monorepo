type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'site_users',
	columns: [
		{ name: 'site_id', type: 'string', isIndexed: true },
		{ name: 'user_id', type: 'string', isIndexed: true },
		{ name: 'consumer_key', type: 'string', isIndexed: true },
		{ name: 'consumer_secret', type: 'string', isIndexed: true },
	],
};

export default schema;
