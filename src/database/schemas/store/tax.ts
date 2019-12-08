type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'taxes',
	columns: [
		{ name: 'parent_id', type: 'string', isIndexed: true },
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'rate_code', type: 'string' },
		{ name: 'rate_id', type: 'string' },
		{ name: 'label', type: 'string' },
		{ name: 'compound', type: 'boolean' },
		{ name: 'tax_total', type: 'string' },
		{ name: 'shipping_tax_total', type: 'string' },
	],
};

export default schema;
