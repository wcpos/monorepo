export const couponsLiteral = {
	title: 'WooCommerce Coupon schema',
	version: 0,
	description: 'WooCommerce Coupon schema',
	type: 'object',
	primaryKey: 'uuid',
	properties: {
		uuid: {
			description: 'Unique identifier for the coupon',
			type: 'string',
			maxLength: 36,
		},
		id: {
			type: 'integer',
		},
		code: {
			type: 'string',
		},
		amount: {
			type: 'string',
		},
		discount_type: {
			type: 'string',
			enum: ['percent', 'fixed_cart', 'fixed_product'],
		},
		description: {
			type: 'string',
		},
		date_created_gmt: {
			type: 'string',
		},
		date_modified_gmt: {
			type: 'string',
		},
		date_expires_gmt: {
			type: ['string', 'null'],
		},
		usage_count: {
			type: 'integer',
		},
		individual_use: {
			type: 'boolean',
		},
		product_ids: {
			type: 'array',
			items: {
				type: 'integer',
			},
		},
		excluded_product_ids: {
			type: 'array',
			items: {
				type: 'integer',
			},
		},
		usage_limit: {
			type: ['integer', 'null'],
		},
		usage_limit_per_user: {
			type: ['integer', 'null'],
		},
		limit_usage_to_x_items: {
			type: ['integer', 'null'],
		},
		free_shipping: {
			type: 'boolean',
		},
		product_categories: {
			type: 'array',
			items: {
				type: 'integer',
			},
		},
		excluded_product_categories: {
			type: 'array',
			items: {
				type: 'integer',
			},
		},
		exclude_sale_items: {
			type: 'boolean',
		},
		minimum_amount: {
			type: 'string',
		},
		maximum_amount: {
			type: 'string',
		},
		email_restrictions: {
			type: 'array',
			items: {
				type: 'string',
			},
		},
		used_by: {
			type: 'array',
			items: {
				type: 'string',
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
					value: {},
				},
			},
		},
	},
	required: ['uuid'],
	indexes: ['code'],
} as const;
