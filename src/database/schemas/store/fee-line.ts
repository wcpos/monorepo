type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'fee_lines',
	columns: [
		{ name: 'order_id', type: 'string', isIndexed: true },
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'name', type: 'string' },
		{ name: 'tax_class', type: 'string' },
		{ name: 'tax_status', type: 'string' },
		{ name: 'total', type: 'string' },
		{ name: 'tax_total', type: 'string' },
	],
};

export default schema;
