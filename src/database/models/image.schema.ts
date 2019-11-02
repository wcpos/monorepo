type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'images',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'date_created', type: 'string' },
		{ name: 'date_created_gmt', type: 'string' },
		{ name: 'date_modified', type: 'string' },
		{ name: 'date_modified_gmt', type: 'string' },
		{ name: 'src', type: 'string' },
		{ name: 'name', type: 'string' },
		{ name: 'alt', type: 'string' },
	],
};

export default schema;
