export const productsLiteral = {
	title: 'WooCommerce Product schema',
	version: 0,
	description: 'WooCommerce Product schema',
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
		name: {
			type: 'string',
		},
		slug: {
			type: 'string',
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
		type: {
			default: 'simple',
			enum: ['simple', 'grouped', 'external', 'variable'],
			type: 'string',
		},
		status: {
			default: 'publish',
			enum: ['draft', 'pending', 'private', 'publish'],
			type: 'string',
		},
		featured: {
			type: 'boolean',
		},
		catalog_visibility: {
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
			enum: ['instock', 'outofstock', 'onbackorder', 'lowstock'],
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
		shipping_required: {
			type: 'boolean',
		},
		shipping_taxable: {
			type: 'boolean',
		},
		shipping_class: {
			type: 'string',
		},
		shipping_class_id: {
			type: 'integer',
		},
		related_ids: {
			type: 'array',
			items: {
				type: 'integer',
			},
		},
		upsell_ids: {
			type: 'array',
			items: {
				type: 'integer',
			},
		},
		cross_sell_ids: {
			type: 'array',
			items: {
				type: 'integer',
			},
		},
		parent_id: {
			type: 'integer',
		},
		categories: {
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
					slug: {
						type: 'string',
					},
				},
			},
		},
		tags: {
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
					slug: {
						type: 'string',
					},
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
					position: {
						type: 'integer',
					},
					visible: {
						type: 'boolean',
						default: false,
					},
					variation: {
						type: 'boolean',
						default: false,
					},
					options: {
						type: 'array',
						items: {
							type: 'string',
						},
					},
				},
			},
		},
		default_attributes: {
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
		variations: {
			type: 'array',
			items: {
				type: 'integer',
			},
		},
		grouped_products: {
			type: 'array',
			items: {
				type: 'integer',
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
	},
} as const;
