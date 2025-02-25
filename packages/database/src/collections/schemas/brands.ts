export const brandsLiteral = {
	title: 'WooCommerce Product Brands schema',
	version: 0,
	description: 'WooCommerce Product Brands schema',
	type: 'object',
	primaryKey: 'uuid',
	indexes: ['id', 'parent'],
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
			description: 'Brands name.',
		},
		slug: {
			type: 'string',
			description: 'An alphanumeric identifier for the resource unique to its type.',
		},
		parent: {
			type: 'integer',
			description: 'The ID for the parent of the resource.',
			multipleOf: 1,
			minimum: 0,
			maximum: 2147483647,
		},
		description: {
			type: 'string',
			description: 'HTML description of the resource.',
		},
		display: {
			type: 'string',
			description: 'Brands archive display type.',
			enum: ['default', 'products', 'subcategories', 'both'],
			default: 'default',
		},
		image: {
			type: 'object',
			description: 'Image data.',
			properties: {
				id: {
					type: 'integer',
					description: 'Image ID.',
				},
				date_created: {
					type: 'string',
					format: 'date-time',
					description: "The date the image was created, in the site's timezone.",
				},
				date_modified: {
					type: 'string',
					format: 'date-time',
					description: "The date the image was last modified, in the site's timezone.",
				},
				src: {
					type: 'string',
					format: 'uri',
					description: 'Image URL.',
				},
				title: {
					type: 'string',
					description: 'Image name.',
				},
				alt: {
					type: 'string',
					description: 'Image alternative text.',
				},
			},
		},
		menu_order: {
			type: 'integer',
			description: 'Menu order, used to custom sort the resource.',
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
