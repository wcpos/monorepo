type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'shipping_lines',
	columns: [
		{ name: 'order_id', type: 'string', isIndexed: true },
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'method_title', type: 'string' },
		{ name: 'method_id', type: 'string' },
		{ name: 'total', type: 'string' },
		{ name: 'tax_total', type: 'string' },
	],
};

export default schema;
