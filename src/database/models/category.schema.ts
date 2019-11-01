type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'categories',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'name', type: 'string' },
		{ name: 'slug', type: 'string' },
		{ name: 'parent', type: 'number' },
		{ name: 'description', type: 'string' },
		{ name: 'display', type: 'string' },
		{ name: 'menu_order', type: 'number' },
		{ name: 'count', type: 'number' },
	],
};

export default schema;
