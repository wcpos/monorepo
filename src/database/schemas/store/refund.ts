type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'refunds',
	columns: [
		{ name: 'order_id', type: 'string', isIndexed: true },
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'reason', type: 'string' },
		{ name: 'total', type: 'string' },
	],
};

export default schema;
