export const gatewaysLiteral = {
	title: 'WooCommerce Payment Gateway schema',
	version: 0,
	description: 'WooCommerce Payment Gateway schema',
	type: 'object',
	primaryKey: 'id',
	properties: {
		id: {
			description: 'Unique identifier for the resource.',
			type: 'string',
			maxLength: 100,
		},
		description: {
			type: 'string',
		},
		order: {
			type: 'integer',
		},
		enabled: {
			type: 'boolean',
		},
		title: {
			type: 'string',
		},
		method_title: {
			type: 'string',
		},
		method_description: {
			type: 'string',
		},
		method_supports: {
			type: 'array',
			items: {
				type: 'string',
			},
		},
		connection_url: {
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
