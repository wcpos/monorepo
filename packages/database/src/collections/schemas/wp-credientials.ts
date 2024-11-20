export const wpCredentialsLiteral = {
	title: 'WP Credentials schema',
	version: 0,
	description: 'WordPress credentials',
	type: 'object',
	primaryKey: 'uuid',
	attachments: {},
	properties: {
		uuid: {
			description: 'Unique identifier for the resource.',
			type: 'string',
			maxLength: 36,
		},
		id: {
			type: 'number',
		},
		username: {
			type: 'string',
		},
		first_name: {
			type: 'string',
		},
		last_name: {
			type: 'string',
		},
		email: {
			type: 'string',
		},
		display_name: {
			type: 'string',
		},
		nice_name: {
			type: 'string',
		},
		last_access: {
			type: 'string',
		},
		avatar_url: {
			type: 'string',
		},
		jwt: {
			type: 'string',
		},
		wp_nonce: {
			type: 'string',
		},
		key_id: {
			type: 'number',
		},
		key_permissions: {
			type: 'string',
		},
		stores: {
			type: 'array',
			ref: 'stores',
			items: {
				type: 'string',
			},
		},
		date_created_gmt: {
			type: 'string',
		},
		date_modified_gmt: {
			type: 'string',
		},
	},
} as const;
