export const sitesLiteral = {
	title: 'Site schema',
	version: 6,
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
		locale: {
			description: 'WordPress site locale, e.g. en_US.',
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
		wcpos_login_url: {
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
		use_rest_route_param: {
			type: 'boolean',
		},
		use_protocol_headers: {
			type: 'boolean',
		},
		/**
		 * Meta keys the store ADDED to search through the plugin's `woocommerce_pos_search_fields`
		 * filter, per collection, as published by `wcpos/v2/site` (monorepo#2411). The till folds
		 * them into its local search as `meta_data:<key>` fields so a customer found by a loyalty
		 * number on the server is also found from local rows. Refreshed with the rest of the site
		 * payload at connect. Absent on a site whose plugin predates the key.
		 */
		search_meta_keys: {
			type: 'object',
			properties: {
				customers: { type: 'array', items: { type: 'string' } },
				orders: { type: 'array', items: { type: 'string' } },
			},
		},
	},
} as const;
