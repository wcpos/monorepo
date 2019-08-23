type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'ui_columns',
	columns: [
		{ name: 'ui_id', type: 'string', isIndexed: true },
		{ name: 'key', type: 'string' },
		{ name: 'section', type: 'string' },
		{ name: 'order', type: 'number' },
		{ name: 'hide', type: 'boolean' },
		{ name: 'disableSort', type: 'boolean' },
		{ name: 'flexGrow', type: 'number', isOptional: true },
		{ name: 'flexShrink', type: 'number', isOptional: true },
		{ name: 'width', type: 'string', isOptional: true },
	],
};

export default schema;
