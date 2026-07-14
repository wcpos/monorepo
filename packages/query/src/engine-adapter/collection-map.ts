export type LegacyCollectionName =
	| 'products'
	| 'variations'
	| 'orders'
	| 'customers'
	| 'taxes'
	| 'products/categories'
	| 'products/tags'
	| 'products/brands'
	| 'coupons';

export type EngineCollectionName =
	| 'products'
	| 'variations'
	| 'orders'
	| 'customers'
	| 'taxRates'
	| 'categories'
	| 'tags'
	| 'brands'
	| 'coupons';

export type EngineDocument = Record<string, unknown> & {
	id: string;
	payload?: Record<string, unknown>;
};

export type FieldKind = 'promoted' | 'payload' | 'computed' | 'identifier';

export type FieldMapEntry = {
	legacy: string;
	kind: FieldKind;
	enginePath: string;
	readEnginePath?: string;
	numeric?: boolean;
	notes?: string;
	compute?: (document: EngineDocument) => unknown;
	fallback?: true;
};

type CollectionMapEntry = {
	engineCollection: EngineCollectionName;
	fields: Record<string, FieldMapEntry>;
};

function valueAtPath(value: unknown, path: string): unknown {
	return path.split('.').reduce<unknown>((current, part) => {
		if (current === null || typeof current !== 'object') {
			return undefined;
		}
		return (current as Record<string, unknown>)[part];
	}, value);
}

function metadataValue(document: EngineDocument, key: string): unknown {
	const metadata = valueAtPath(document, 'payload.meta_data');
	if (!Array.isArray(metadata)) {
		return undefined;
	}
	const entry = metadata.find(
		(item) =>
			item !== null && typeof item === 'object' && (item as Record<string, unknown>).key === key
	);
	return entry && typeof entry === 'object' ? (entry as Record<string, unknown>).value : undefined;
}

function couponIsActive(document: EngineDocument): boolean {
	if (valueAtPath(document, 'payload.status') !== 'publish') {
		return false;
	}
	const expires = valueAtPath(document, 'payload.date_expires_gmt');
	if (typeof expires !== 'string' || expires.length === 0) {
		return true;
	}
	const timestamp = Date.parse(expires.endsWith('Z') ? expires : `${expires}Z`);
	return Number.isNaN(timestamp) || timestamp >= Date.now();
}

/**
 * The explicit legacy-to-engine field contract. Logs and templates are intentionally absent.
 * `readEnginePath` preserves a legacy result type when its promoted query column is lossy.
 */
export const collectionMap = {
	products: {
		engineCollection: 'products',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: { legacy: 'id', kind: 'identifier', enginePath: 'wooProductId' },
			stock_status: {
				legacy: 'stock_status',
				kind: 'promoted',
				enginePath: 'stockStatus',
			},
			featured: {
				legacy: 'featured',
				kind: 'promoted',
				enginePath: 'featured',
			},
			on_sale: { legacy: 'on_sale', kind: 'promoted', enginePath: 'onSale' },
			categories: {
				legacy: 'categories',
				kind: 'promoted',
				enginePath: 'categoryIds',
				readEnginePath: 'payload.categories',
				notes: 'Selectors use numeric membership; reads preserve Woo category objects.',
			},
			brands: {
				legacy: 'brands',
				kind: 'promoted',
				enginePath: 'brandIds',
				readEnginePath: 'payload.brands',
				notes: 'Selectors use numeric membership; reads preserve Woo brand objects.',
			},
			tags: { legacy: 'tags', kind: 'payload', enginePath: 'payload.tags' },
			meta_data: {
				legacy: 'meta_data',
				kind: 'payload',
				enginePath: 'payload.meta_data',
			},
			name: { legacy: 'name', kind: 'payload', enginePath: 'payload.name' },
			status: {
				legacy: 'status',
				kind: 'payload',
				enginePath: 'payload.status',
				notes: 'Synthetic Manager-test selector; no production product selector was observed.',
			},
			category: {
				legacy: 'category',
				kind: 'payload',
				enginePath: 'payload.category',
				notes: 'Synthetic Manager-test selector with no demonstrated product payload contract.',
			},
			sku: { legacy: 'sku', kind: 'payload', enginePath: 'payload.sku' },
			barcode: {
				legacy: 'barcode',
				kind: 'payload',
				enginePath: 'payload.barcode',
			},
			type: { legacy: 'type', kind: 'promoted', enginePath: 'type' },
			stock_quantity: {
				legacy: 'stock_quantity',
				kind: 'promoted',
				enginePath: 'stockQuantity',
			},
			date_created_gmt: {
				legacy: 'date_created_gmt',
				kind: 'payload',
				enginePath: 'payload.date_created_gmt',
			},
			sortable_price: {
				legacy: 'sortable_price',
				kind: 'computed',
				enginePath: 'payload.price',
				numeric: true,
				notes: 'Numeric JS sort over the source string; never the cents-rounded promoted price.',
				compute: (document) => Number(valueAtPath(document, 'payload.price')),
			},
			date_modified_gmt: {
				legacy: 'date_modified_gmt',
				kind: 'payload',
				enginePath: 'payload.date_modified_gmt',
			},
			total_sales: {
				legacy: 'total_sales',
				kind: 'payload',
				enginePath: 'payload.total_sales',
			},
			menu_order: {
				legacy: 'menu_order',
				kind: 'payload',
				enginePath: 'payload.menu_order',
			},
			price: {
				legacy: 'price',
				kind: 'promoted',
				enginePath: 'price',
				readEnginePath: 'payload.price',
				numeric: true,
				notes: 'Promoted price is numeric cents precision; reads preserve the Woo string.',
			},
			regular_price: {
				legacy: 'regular_price',
				kind: 'payload',
				enginePath: 'payload.regular_price',
			},
			sale_price: {
				legacy: 'sale_price',
				kind: 'payload',
				enginePath: 'payload.sale_price',
			},
			tax_status: {
				legacy: 'tax_status',
				kind: 'payload',
				enginePath: 'payload.tax_status',
			},
			tax_class: {
				legacy: 'tax_class',
				kind: 'payload',
				enginePath: 'payload.tax_class',
			},
			manage_stock: {
				legacy: 'manage_stock',
				kind: 'payload',
				enginePath: 'payload.manage_stock',
			},
			attributes: {
				legacy: 'attributes',
				kind: 'payload',
				enginePath: 'payload.attributes',
			},
			images: {
				legacy: 'images',
				kind: 'payload',
				enginePath: 'payload.images',
			},
			grouped_products: {
				legacy: 'grouped_products',
				kind: 'payload',
				enginePath: 'payload.grouped_products',
			},
			variations: {
				legacy: 'variations',
				kind: 'payload',
				enginePath: 'payload.variations',
			},
			cost_of_goods_sold: {
				legacy: 'cost_of_goods_sold',
				kind: 'payload',
				enginePath: 'payload.cost_of_goods_sold',
			},
			slug: { legacy: 'slug', kind: 'payload', enginePath: 'payload.slug' },
		},
	},
	variations: {
		engineCollection: 'variations',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: { legacy: 'id', kind: 'identifier', enginePath: 'wooId' },
			attributes: {
				legacy: 'attributes',
				kind: 'promoted',
				enginePath: 'attributes',
				readEnginePath: 'payload.attributes',
				notes: 'Selectors use normalized attributes; reads retain the source payload.',
			},
			name: { legacy: 'name', kind: 'payload', enginePath: 'payload.name' },
			sku: { legacy: 'sku', kind: 'payload', enginePath: 'payload.sku' },
			barcode: {
				legacy: 'barcode',
				kind: 'payload',
				enginePath: 'payload.barcode',
			},
			price: {
				legacy: 'price',
				kind: 'promoted',
				enginePath: 'price',
				readEnginePath: 'payload.price',
				numeric: true,
			},
			regular_price: {
				legacy: 'regular_price',
				kind: 'payload',
				enginePath: 'payload.regular_price',
			},
			sale_price: {
				legacy: 'sale_price',
				kind: 'payload',
				enginePath: 'payload.sale_price',
			},
			on_sale: {
				legacy: 'on_sale',
				kind: 'payload',
				enginePath: 'payload.on_sale',
			},
			tax_status: {
				legacy: 'tax_status',
				kind: 'payload',
				enginePath: 'payload.tax_status',
			},
			tax_class: {
				legacy: 'tax_class',
				kind: 'payload',
				enginePath: 'payload.tax_class',
			},
			stock_quantity: {
				legacy: 'stock_quantity',
				kind: 'promoted',
				enginePath: 'stockQuantity',
			},
			manage_stock: {
				legacy: 'manage_stock',
				kind: 'payload',
				enginePath: 'payload.manage_stock',
			},
			stock_status: {
				legacy: 'stock_status',
				kind: 'promoted',
				enginePath: 'stockStatus',
			},
			image: { legacy: 'image', kind: 'payload', enginePath: 'payload.image' },
			cost_of_goods_sold: {
				legacy: 'cost_of_goods_sold',
				kind: 'payload',
				enginePath: 'payload.cost_of_goods_sold',
			},
			date_created_gmt: {
				legacy: 'date_created_gmt',
				kind: 'payload',
				enginePath: 'payload.date_created_gmt',
			},
			date_modified_gmt: {
				legacy: 'date_modified_gmt',
				kind: 'payload',
				enginePath: 'payload.date_modified_gmt',
			},
			parent_id: {
				legacy: 'parent_id',
				kind: 'promoted',
				enginePath: 'parentId',
			},
		},
	},
	orders: {
		engineCollection: 'orders',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: { legacy: 'id', kind: 'identifier', enginePath: 'wooOrderId' },
			status: { legacy: 'status', kind: 'promoted', enginePath: 'status' },
			customer_id: {
				legacy: 'customer_id',
				kind: 'promoted',
				enginePath: 'customerId',
			},
			date_created_gmt: {
				legacy: 'date_created_gmt',
				kind: 'promoted',
				enginePath: 'dateCreatedGmt',
			},
			meta_data: {
				legacy: 'meta_data',
				kind: 'payload',
				enginePath: 'payload.meta_data',
			},
			created_via: {
				legacy: 'created_via',
				kind: 'payload',
				enginePath: 'payload.created_via',
			},
			number: { legacy: 'number', kind: 'promoted', enginePath: 'number' },
			payment_method: {
				legacy: 'payment_method',
				kind: 'payload',
				enginePath: 'payload.payment_method',
			},
			sortable_total: {
				legacy: 'sortable_total',
				kind: 'computed',
				enginePath: 'payload.total',
				numeric: true,
				notes: 'Numeric JS sort over the source string; no engine numeric total exists.',
				compute: (document) => Number(valueAtPath(document, 'payload.total')),
			},
			billing: {
				legacy: 'billing',
				kind: 'payload',
				enginePath: 'payload.billing',
			},
			shipping: {
				legacy: 'shipping',
				kind: 'payload',
				enginePath: 'payload.shipping',
			},
			payment_method_title: {
				legacy: 'payment_method_title',
				kind: 'payload',
				enginePath: 'payload.payment_method_title',
			},
			total: { legacy: 'total', kind: 'promoted', enginePath: 'total' },
			currency_symbol: {
				legacy: 'currency_symbol',
				kind: 'payload',
				enginePath: 'payload.currency_symbol',
			},
			refunds: {
				legacy: 'refunds',
				kind: 'payload',
				enginePath: 'payload.refunds',
			},
			customer_note: {
				legacy: 'customer_note',
				kind: 'payload',
				enginePath: 'payload.customer_note',
			},
			date_modified_gmt: {
				legacy: 'date_modified_gmt',
				kind: 'payload',
				enginePath: 'payload.date_modified_gmt',
			},
			date_completed_gmt: {
				legacy: 'date_completed_gmt',
				kind: 'payload',
				enginePath: 'payload.date_completed_gmt',
			},
			date_paid_gmt: {
				legacy: 'date_paid_gmt',
				kind: 'payload',
				enginePath: 'payload.date_paid_gmt',
			},
			discount_total: {
				legacy: 'discount_total',
				kind: 'payload',
				enginePath: 'payload.discount_total',
			},
			total_tax: {
				legacy: 'total_tax',
				kind: 'payload',
				enginePath: 'payload.total_tax',
			},
			needs_payment: {
				legacy: 'needs_payment',
				kind: 'payload',
				enginePath: 'payload.needs_payment',
			},
			tax_lines: {
				legacy: 'tax_lines',
				kind: 'payload',
				enginePath: 'payload.tax_lines',
			},
			shipping_lines: {
				legacy: 'shipping_lines',
				kind: 'payload',
				enginePath: 'payload.shipping_lines',
			},
			line_items: {
				legacy: 'line_items',
				kind: 'payload',
				enginePath: 'payload.line_items',
			},
			slug: { legacy: 'slug', kind: 'payload', enginePath: 'payload.slug' },
			cashier: {
				legacy: 'cashier',
				kind: 'computed',
				enginePath: 'payload.meta_data',
				notes: 'Value of the _pos_user metadata entry.',
				compute: (document) => metadataValue(document, '_pos_user'),
			},
			select: {
				legacy: 'select',
				kind: 'computed',
				enginePath: 'id',
				notes: 'Report selection is UI state and has no engine-document value.',
				compute: () => undefined,
			},
		},
	},
	customers: {
		engineCollection: 'customers',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: { legacy: 'id', kind: 'identifier', enginePath: 'wooCustomerId' },
			role: { legacy: 'role', kind: 'payload', enginePath: 'payload.role' },
			last_name: {
				legacy: 'last_name',
				kind: 'payload',
				enginePath: 'payload.last_name',
			},
			first_name: {
				legacy: 'first_name',
				kind: 'payload',
				enginePath: 'payload.first_name',
			},
			email: { legacy: 'email', kind: 'payload', enginePath: 'payload.email' },
			username: {
				legacy: 'username',
				kind: 'payload',
				enginePath: 'payload.username',
			},
			date_created_gmt: {
				legacy: 'date_created_gmt',
				kind: 'payload',
				enginePath: 'payload.date_created_gmt',
			},
			date_modified_gmt: {
				legacy: 'date_modified_gmt',
				kind: 'payload',
				enginePath: 'payload.date_modified_gmt',
			},
			avatar_url: {
				legacy: 'avatar_url',
				kind: 'payload',
				enginePath: 'payload.avatar_url',
			},
			billing: {
				legacy: 'billing',
				kind: 'payload',
				enginePath: 'payload.billing',
			},
			shipping: {
				legacy: 'shipping',
				kind: 'payload',
				enginePath: 'payload.shipping',
			},
			slug: { legacy: 'slug', kind: 'payload', enginePath: 'payload.slug' },
		},
	},
	taxes: {
		engineCollection: 'taxRates',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: { legacy: 'id', kind: 'identifier', enginePath: 'wooTaxRateId' },
			country: {
				legacy: 'country',
				kind: 'payload',
				enginePath: 'payload.country',
			},
			state: { legacy: 'state', kind: 'payload', enginePath: 'payload.state' },
			postcodes: {
				legacy: 'postcodes',
				kind: 'payload',
				enginePath: 'payload.postcodes',
			},
			cities: {
				legacy: 'cities',
				kind: 'payload',
				enginePath: 'payload.cities',
			},
			rate: { legacy: 'rate', kind: 'payload', enginePath: 'payload.rate' },
			name: { legacy: 'name', kind: 'payload', enginePath: 'payload.name' },
			priority: {
				legacy: 'priority',
				kind: 'payload',
				enginePath: 'payload.priority',
			},
			compound: {
				legacy: 'compound',
				kind: 'payload',
				enginePath: 'payload.compound',
			},
			shipping: {
				legacy: 'shipping',
				kind: 'payload',
				enginePath: 'payload.shipping',
			},
			class: { legacy: 'class', kind: 'payload', enginePath: 'payload.class' },
			order: { legacy: 'order', kind: 'payload', enginePath: 'payload.order' },
		},
	},
	'products/categories': {
		engineCollection: 'categories',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: { legacy: 'id', kind: 'identifier', enginePath: 'wooId' },
			name: { legacy: 'name', kind: 'payload', enginePath: 'payload.name' },
			parent: {
				legacy: 'parent',
				kind: 'payload',
				enginePath: 'payload.parent',
			},
		},
	},
	'products/tags': {
		engineCollection: 'tags',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: { legacy: 'id', kind: 'identifier', enginePath: 'wooId' },
			name: { legacy: 'name', kind: 'payload', enginePath: 'payload.name' },
		},
	},
	'products/brands': {
		engineCollection: 'brands',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: { legacy: 'id', kind: 'identifier', enginePath: 'wooId' },
			name: { legacy: 'name', kind: 'payload', enginePath: 'payload.name' },
			parent: {
				legacy: 'parent',
				kind: 'payload',
				enginePath: 'payload.parent',
			},
		},
	},
	coupons: {
		engineCollection: 'coupons',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: { legacy: 'id', kind: 'identifier', enginePath: 'wooId' },
			status: {
				legacy: 'status',
				kind: 'payload',
				enginePath: 'payload.status',
			},
			discount_type: {
				legacy: 'discount_type',
				kind: 'payload',
				enginePath: 'payload.discount_type',
			},
			date_expires_gmt: {
				legacy: 'date_expires_gmt',
				kind: 'payload',
				enginePath: 'payload.date_expires_gmt',
			},
			code: { legacy: 'code', kind: 'payload', enginePath: 'payload.code' },
			date_created_gmt: {
				legacy: 'date_created_gmt',
				kind: 'payload',
				enginePath: 'payload.date_created_gmt',
			},
			date_modified_gmt: {
				legacy: 'date_modified_gmt',
				kind: 'payload',
				enginePath: 'payload.date_modified_gmt',
			},
			amount: {
				legacy: 'amount',
				kind: 'payload',
				enginePath: 'payload.amount',
			},
			description: {
				legacy: 'description',
				kind: 'payload',
				enginePath: 'payload.description',
			},
			usage_count: {
				legacy: 'usage_count',
				kind: 'payload',
				enginePath: 'payload.usage_count',
			},
			usage_limit: {
				legacy: 'usage_limit',
				kind: 'payload',
				enginePath: 'payload.usage_limit',
			},
			slug: { legacy: 'slug', kind: 'payload', enginePath: 'payload.slug' },
			active: {
				legacy: 'active',
				kind: 'computed',
				enginePath: 'payload.status',
				notes: 'Published and either non-expiring or not yet expired.',
				compute: couponIsActive,
			},
		},
	},
} as const satisfies Record<LegacyCollectionName, CollectionMapEntry>;

export function resolveLegacyField(
	collection: LegacyCollectionName,
	legacy: string
): FieldMapEntry {
	const fields = collectionMap[collection].fields as Record<string, FieldMapEntry>;
	return (
		fields[legacy] ?? {
			legacy,
			kind: 'payload',
			enginePath: `payload.${legacy}`,
			fallback: true,
		}
	);
}

export function legacyFieldForEnginePath(
	collection: LegacyCollectionName,
	enginePath: string
): string | undefined {
	const fields = Object.values(collectionMap[collection].fields as Record<string, FieldMapEntry>);
	return fields.find((field) => field.enginePath === enginePath)?.legacy;
}

export function readLegacyField(
	collection: LegacyCollectionName,
	document: EngineDocument,
	legacy: string
): unknown {
	const field = resolveLegacyField(collection, legacy);
	if (field.compute) {
		return field.compute(document);
	}
	return valueAtPath(document, field.readEnginePath ?? field.enginePath);
}

export function readEnginePath(document: EngineDocument, path: string): unknown {
	return valueAtPath(document, path);
}
