type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'product_categories',
	columns: [
		{ name: 'product_id', type: 'string' },
		{ name: 'category_id', type: 'string' },
	],
};

export default schema;
