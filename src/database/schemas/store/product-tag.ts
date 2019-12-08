type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'product_tags',
	columns: [
		{ name: 'product_id', type: 'string' },
		{ name: 'tag_id', type: 'string' },
	],
};

export default schema;
