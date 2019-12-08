type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'meta',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'parent_id', type: 'string', isIndexed: true },
		{ name: 'key', type: 'string' },
		{ name: 'value', type: 'string' },
	],
};

export default schema;
