type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'addresses',
	columns: [
		{ name: 'customer_id', type: 'string', isIndexed: true },
		{ name: 'type', type: 'string' },
		{ name: 'address_1', type: 'string' },
		{ name: 'address_2', type: 'string' },
		{ name: 'city', type: 'string' },
		{ name: 'company', type: 'string' },
		{ name: 'country', type: 'string' },
		{ name: 'email', type: 'string' },
		{ name: 'first_name', type: 'string' },
		{ name: 'last_name', type: 'string' },
		{ name: 'phone', type: 'string' },
		{ name: 'postcode', type: 'string' },
		{ name: 'state', type: 'string' },
	],
};

export default schema;
