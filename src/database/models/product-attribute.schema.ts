type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'product_attributes',
	columns: [
		{ name: 'product_id', type: 'string' },
		{ name: 'attribute_id', type: 'string' },
	],
};

export default schema;
