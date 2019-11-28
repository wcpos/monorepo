type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'product_meta',
	columns: [
		{ name: 'product_id', type: 'string' },
		{ name: 'meta_id', type: 'string' },
	],
};

export default schema;
