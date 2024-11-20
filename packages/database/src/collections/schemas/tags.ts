export const tagsLiteral = {
	title: 'WooCommerce Product Tag schema',
	version: 1,
	description: 'WooCommerce Product Tag schema',
	type: 'object',
	primaryKey: 'uuid',
	indexes: ['id'],
	properties: {
		uuid: {
			description: 'Unique identifier for the resource.',
			type: 'string',
			maxLength: 36,
		},
		id: {
			type: 'integer',
			description: 'Unique remote identifier for the resource.',
			multipleOf: 1,
			minimum: 0,
			maximum: 2147483647,
		},
		name: {
			type: 'string',
			description: 'Tag name.',
		},
		slug: {
			type: 'string',
			description: 'An alphanumeric identifier for the resource unique to its type.',
		},
		description: {
			type: 'string',
			description: 'HTML description of the resource.',
		},
		count: {
			type: 'integer',
			description: 'Number of published products for the resource.',
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
