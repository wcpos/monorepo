type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'coupon_lines',
	columns: [
		{ name: 'order_id', type: 'string', isIndexed: true },
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'code', type: 'string' },
		{ name: 'discount', type: 'string' },
		{ name: 'discount_tax', type: 'string' },
	],
};

export default schema;
