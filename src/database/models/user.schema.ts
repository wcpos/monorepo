type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'users',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'site_id', type: 'string', isIndexed: true },
		{ name: 'username', type: 'string' },
		{ name: 'name', type: 'string' },
		{ name: 'first_name', type: 'string' },
		{ name: 'last_name', type: 'string' },
		{ name: 'email', type: 'string' },
		{ name: 'nickname', type: 'string' },
		{ name: 'slug', type: 'string' },
		{ name: 'last_access', type: 'string' },
		{ name: 'roles', type: 'string' },
		{ name: 'locale', type: 'string' },
		{ name: 'meta', type: 'string' },
		{ name: 'consumer_key', type: 'string' },
		{ name: 'consumer_secret', type: 'string' },
	],
};

export default schema;
