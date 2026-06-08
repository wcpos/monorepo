export const taxRatesLiteral = {
	title: 'WooCommerce Tax Rate schema',
	version: 1,
	description: 'WooCommerce Tax Rate schema',
	type: 'object',
	primaryKey: 'uuid',
	properties: {
		uuid: {
			description: 'Not a UUID! This is the WC REST API ID but coerced to a string',
			type: 'string',
			maxLength: 8,
		},
		id: {
			type: 'integer',
		},
		country: {
			// WooCommerce allows an empty country on a tax rate, meaning the
			// rate applies to all countries (a "general" rate). It can also
			// return ISO 3166 alpha-2 codes. Keep this a plain string rather
			// than an enum so legitimate empty/edge values don't fail storage
			// validation and block the whole taxes collection from syncing.
			type: 'string',
		},
		state: {
			type: 'string',
		},
		postcode: {
			type: 'string',
		},
		postcodes: {
			type: 'array',
			items: {
				type: 'string',
			},
		},
		cities: {
			type: 'array',
			items: {
				type: 'string',
			},
		},
		city: {
			type: 'string',
		},
		rate: {
			type: 'string',
		},
		name: {
			type: 'string',
		},
		priority: {
			type: 'integer',
			default: 1,
		},
		compound: {
			type: 'boolean',
			default: false,
		},
		shipping: {
			type: 'boolean',
			default: true,
		},
		order: {
			type: 'integer',
		},
		class: {
			type: 'string',
			default: 'standard',
		},
		date_modified_gmt: {
			type: 'string',
		},
		links: {
			type: 'object',
			properties: {
				collection: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							href: {
								type: 'string',
							},
						},
					},
				},
				self: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							href: {
								type: 'string',
							},
						},
					},
				},
			},
		},
	},
} as const;
