type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'ui_display',
	columns: [
		{ name: 'ui_id', type: 'string', isIndexed: true },
		{ name: 'key', type: 'string' },
		{ name: 'hide', type: 'boolean' },
	],
};

export default schema;
