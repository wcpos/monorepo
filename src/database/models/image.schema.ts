type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'product_categories',
	columns: [{ name: 'remote_id', type: 'number', isIndexed: true }],
};

export default schema;
