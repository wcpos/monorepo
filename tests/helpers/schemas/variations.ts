export const variationsLiteral = {
	title: 'WooCommerce Product Variation schema',
	version: 0,
	description: 'WooCommerce Product Variation schema',
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
			type: 'integer',
		},
		date_created: {
			type: 'string',
		},
		date_created_gmt: {
			type: 'string',
		},
		date_modified: {
			type: 'string',
		},
		date_modified_gmt: {
			type: 'string',
		},
		description: {
			type: 'string',
		},
		sku: {
			type: 'string',
		},
		barcode: {
			type: 'string',
		},
		price: {
			type: 'string',
		},
		regular_price: {
			type: 'string',
		},
		sale_price: {
			type: 'string',
		},
		on_sale: {
			type: 'boolean',
		},
		status: {
			default: 'publish',
			enum: ['draft', 'pending', 'private', 'publish'],
			type: 'string',
		},
		purchasable: {
			type: 'boolean',
		},
		virtual: {
			default: false,
			type: 'boolean',
		},
		tax_status: {
			default: 'taxable',
			enum: ['taxable', 'shipping', 'none'],
			type: 'string',
		},
		tax_class: {
			type: 'string',
		},
		manage_stock: {
			default: false,
			type: 'boolean',
		},
		stock_quantity: {
			type: ['number', 'null'],
		},
		stock_status: {
			default: 'instock',
			enum: ['instock', 'outofstock', 'onbackorder'],
			type: 'string',
		},
		backorders: {
			default: 'no',
			enum: ['no', 'notify', 'yes'],
			type: 'string',
		},
		backorders_allowed: {
			type: 'boolean',
		},
		backordered: {
			type: 'boolean',
		},
		shipping_class: {
			type: 'string',
		},
		shipping_class_id: {
			type: 'integer',
		},
		has_options: {
			type: 'boolean',
		},
		attributes: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: {
						type: 'integer',
					},
					name: {
						type: 'string',
					},
					option: {
						type: 'string',
					},
				},
			},
		},
		meta_data: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: {
						type: 'integer',
					},
					key: {
						type: 'string',
					},
					value: {
						type: 'string',
					},
				},
			},
		},
		parent_id: {
			type: 'integer',
		},
		name: {
			type: 'string',
		},
	},
} as const;
