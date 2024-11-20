export const sitesLiteral = {
	title: 'Site schema',
	version: 1,
	description: 'WordPress site',
	type: 'object',
	primaryKey: 'uuid',
	properties: {
		uuid: {
			description: 'Unique identifier for the resource.',
			type: 'string',
			maxLength: 36,
		},
		url: {
			type: 'string',
		},
		name: {
			type: 'string',
		},
		description: {
			type: 'string',
		},
		home: {
			type: 'string',
		},
		gmt_offset: {
			type: 'string',
		},
		timezone_string: {
			type: 'string',
		},
		site_icon_url: {
			type: 'string',
		},
		wp_version: {
			type: 'string',
		},
		wc_version: {
			type: 'string',
		},
		wcpos_version: {
			type: 'string',
		},
		wcpos_pro_version: {
			type: 'string',
		},
		wp_api_url: {
			type: 'string',
		},
		wc_api_url: {
			type: 'string',
		},
		wcpos_api_url: {
			type: 'string',
		},
		wc_api_auth_url: {
			type: 'string',
		},
		wp_credentials: {
			type: 'array',
			ref: 'wp_credentials',
			items: {
				type: 'string',
			},
		},
		license: {
			type: 'object',
			properties: {
				key: {
					type: 'string',
				},
				status: {
					type: 'string',
				},
				instance: {
					type: 'string',
				},
				expiration: {
					type: 'string',
				},
			},
		},
		use_jwt_as_param: {
			type: 'boolean',
		},
	},
} as const;
