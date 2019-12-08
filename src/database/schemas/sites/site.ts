type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const schema: Schema = {
	name: 'sites',
	columns: [
		{ name: 'name', type: 'string' },
		{ name: 'description', type: 'string' },
		{ name: 'url', type: 'string' },
		{ name: 'home', type: 'string' },
		{ name: 'gmt_offset', type: 'string' },
		{ name: 'timezone_string', type: 'string' },
		{ name: 'namespaces', type: 'string' },
		{ name: 'authentication', type: 'string' },
		{ name: 'routes', type: 'string' },
		{ name: 'wp_api_url', type: 'string' },
		{ name: 'wc_api_url', type: 'string' },
		{ name: 'wc_api_auth_url', type: 'string' },
		{ name: 'connection_status', type: 'string' },
	],
};

export default schema;
