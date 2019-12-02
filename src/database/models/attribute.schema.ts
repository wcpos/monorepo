type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'attributes',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'name', type: 'string' },
		{ name: 'position', type: 'number' },
		{ name: 'visible', type: 'boolean' },
		{ name: 'variation', type: 'boolean' },
		{ name: 'options', type: 'string' },
	],
};

export default schema;
