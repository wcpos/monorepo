export const productsLiteral = {
	title: 'WooCommerce Product schema',
	version: 1,
	description: 'WooCommerce Product schema',
	type: 'object',
	primaryKey: 'uuid',
	attachments: {},
	indexes: ['id', 'barcode', 'stock_status', 'parent_id', 'sortable_price'],
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
		name: {
			type: 'string',
		},
		slug: {
			type: 'string',
		},
		permalink: {
			type: 'string',
			format: 'uri',
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
		description: {
			type: 'string',
		},
		short_description: {
			type: 'string',
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
		price_html: {
			type: 'string',
		},
		on_sale: {
			type: 'boolean',
		},
		purchasable: {
			type: 'boolean',
		},
		total_sales: {
			type: 'number',
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
			items: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
					},
					name: {
						type: 'string',
					},
					file: {
						type: 'string',
					},
				},
			},
		},
		download_limit: {
			default: -1,
			type: 'integer',
		},
		download_expiry: {
			default: -1,
			type: 'integer',
		},
		external_url: {
			type: 'string',
		},
		button_text: {
			type: 'string',
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
			maxLength: 255,
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
		sold_individually: {
			type: 'boolean',
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
		reviews_allowed: {
			type: 'boolean',
		},
		average_rating: {
			type: 'string',
		},
		rating_count: {
			type: 'number',
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
			multipleOf: 1,
			minimum: 0,
			maximum: 2147483647,
		},
		purchase_note: {
			type: 'string',
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
		images: {
			type: 'array',
			items: {
				type: 'object',
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
	},
} as const;
