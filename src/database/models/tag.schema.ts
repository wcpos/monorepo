type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'tags',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'name', type: 'string' },
		{ name: 'slug', type: 'string' },
		{ name: 'parent', type: 'number' },
		{ name: 'description', type: 'string' },
		{ name: 'count', type: 'number' },
	],
};

export default schema;
