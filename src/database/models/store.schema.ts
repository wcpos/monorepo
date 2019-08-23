type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'stores',
	columns: [
		{ name: 'remote_id', type: 'string', isIndexed: true },
		{ name: 'site_id', type: 'string', isIndexed: true },
		{ name: 'name', type: 'string' },
	],
};

export default schema;
