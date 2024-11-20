export const variationsLiteral = {
	title: 'WooCommerce Product Variation schema',
	version: 2,
	description: 'WooCommerce Product Variation schema',
	type: 'object',
	primaryKey: 'uuid',
	attachments: {},
	indexes: ['id', 'barcode', 'parent_id', 'sortable_price'],
	properties: {
		uuid: {
			description: 'Unique identifier for the resource.',
			type: 'string',
			maxLength: 36,
		},
		id: {
			type: 'integer',
			multipleOf: 1,
			minimum: 0,
			maximum: 2147483647,
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
		permalink: {
			type: 'string',
			format: 'uri',
		},
		sku: {
			type: 'string',
		},
		barcode: {
			type: 'string',
			maxLength: 255,
		},
		price: {
			type: 'string',
		},
		sortable_price: {
			type: 'number',
			minimum: -2147483647,
			maximum: 2147483647,
			multipleOf: 0.000001,
		},
		regular_price: {
			type: 'string',
		},
		sale_price: {
			type: 'string',
		},
		date_on_sale_from: {
			type: 'string',
		},
		date_on_sale_from_gmt: {
			type: 'string',
		},
		date_on_sale_to: {
			type: 'string',
		},
		date_on_sale_to_gmt: {
			type: 'string',
		},
		type: {
			default: 'variation',
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
		downloadable: {
			default: false,
			type: 'boolean',
		},
		downloads: {
			type: 'array',
		},
		download_limit: {
			default: -1,
			type: 'integer',
		},
		download_expiry: {
			default: -1,
			type: 'integer',
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
		low_stock_amount: {
			type: ['integer', 'null'],
		},
		weight: {
			type: 'string',
		},
		dimensions: {
			type: 'object',
			properties: {
				length: {
					type: 'string',
				},
				width: {
					type: 'string',
				},
				height: {
					type: 'string',
				},
			},
		},
		shipping_class: {
			type: 'string',
		},
		shipping_class_id: {
			type: 'integer',
		},
		image: {
			type: ['object', 'null'],
			properties: {
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
				src: {
					type: 'string',
					format: 'uri',
				},
				name: {
					type: 'string',
				},
				alt: {
					type: 'string',
				},
			},
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
		menu_order: {
			type: 'integer',
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
		thumbnail: {
			type: 'string',
		},
		parent_id: {
			type: 'integer',
			multipleOf: 1,
			minimum: 0,
			maximum: 2147483647,
		},
		name: {
			type: 'string',
		},
	},
} as const;
