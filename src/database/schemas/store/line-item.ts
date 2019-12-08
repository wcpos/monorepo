type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'line_items',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'order_id', type: 'string', isIndexed: true },
		{ name: 'name', type: 'string' },
		{ name: 'product_id', type: 'number' },
		{ name: 'variation_id', type: 'number' },
		{ name: 'quantity', type: 'number' },
		{ name: 'tax_class', type: 'string' },
		{ name: 'subtotal', type: 'string' },
		{ name: 'subtotal_tax', type: 'string' },
		{ name: 'total', type: 'string' },
		{ name: 'total_tax', type: 'string' },
		{ name: 'meta_data', type: 'string' },
		{ name: 'sku', type: 'string' },
		{ name: 'price', type: 'number' },
	],
};

export default schema;
