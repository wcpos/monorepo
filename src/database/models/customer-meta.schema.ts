type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'customer_meta',
	columns: [
		{ name: 'customer_id', type: 'string' },
		{ name: 'meta_id', type: 'string' },
	],
};

export default schema;
