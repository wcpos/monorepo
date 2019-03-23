import { TableSchemaSpec } from '@nozbe/watermelondb/Schema';

const schema: TableSchemaSpec = {
	name: 'ui_columns',
	columns: [
		{ name: 'ui_id', type: 'string', isIndexed: true },
		{ name: 'key', type: 'string' },
		{ name: 'hide', type: 'boolean' },
		{ name: 'disableSort', type: 'boolean' },
		{ name: 'flexGrow', type: 'number', isOptional: true },
		{ name: 'flexShrink', type: 'number', isOptional: true },
		{ name: 'width', type: 'string', isOptional: true },
	],
};

export default schema;
