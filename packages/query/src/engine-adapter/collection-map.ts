import type {
	CustomerBrowseDimensions,
	OrderBrowseDimensions,
	ProductBrowseDimensions,
	SyncCollectionName,
} from '@wcpos/sync-engine';

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

export type EngineCollectionName = SyncCollectionName;

type CollectionVocabularyEntry = {
	legacyName: LegacyCollectionName;
	telemetryName: string;
	labelKey: string;
	censusRoute: string | null;
	writeable: boolean;
};

export const COLLECTION_VOCABULARY = {
	orders: {
		legacyName: 'orders',
		telemetryName: 'orders',
		labelKey: 'common.orders',
		censusRoute: 'wc/v3/orders',
		writeable: true,
	},
	products: {
		legacyName: 'products',
		telemetryName: 'products',
		labelKey: 'common.products',
		censusRoute: 'wc/v3/products',
		writeable: true,
	},
	variations: {
		legacyName: 'variations',
		telemetryName: 'variations',
		labelKey: 'common.variations',
		// Woo core exposes variations only beneath a specific product, but the
		// WCPOS plugin's cross-parent route (the 1.9 barcode-search route) is a
		// plain post_type=product_variation query that emits X-WP-Total, and it
		// carries the same product-read grant as wc/v3/products above.
		censusRoute: 'wcpos/v1/products/variations',
		writeable: true,
	},
	customers: {
		legacyName: 'customers',
		telemetryName: 'customers',
		labelKey: 'common.customers',
		censusRoute: 'wcpos/v2/customers',
		writeable: true,
	},
	taxRates: {
		legacyName: 'taxes',
		telemetryName: 'tax_rates',
		labelKey: 'common.tax_rates',
		// Raw wc/v3/taxes requires `manage_woocommerce`, which cashier-tier POS users
		// (e.g. the demo role) don't have — every census probe 403s and spams the error
		// log. The POS proxy serves the same rows + X-WP-Total under the POS grant.
		censusRoute: 'wcpos/v2/taxes',
		writeable: false,
	},
	categories: {
		legacyName: 'products/categories',
		telemetryName: 'categories',
		labelKey: 'common.categories',
		censusRoute: 'wc/v3/products/categories',
		writeable: false,
	},
	brands: {
		legacyName: 'products/brands',
		telemetryName: 'brands',
		labelKey: 'common.brands',
		censusRoute: 'wc/v3/products/brands',
		writeable: false,
	},
	tags: {
		legacyName: 'products/tags',
		telemetryName: 'tags',
		labelKey: 'common.tags',
		censusRoute: 'wc/v3/products/tags',
		writeable: false,
	},
	coupons: {
		legacyName: 'coupons',
		telemetryName: 'coupons',
		labelKey: 'common.coupons',
		censusRoute: 'wc/v3/coupons',
		writeable: true,
	},
} as const satisfies Record<SyncCollectionName, CollectionVocabularyEntry>;

export type WriteableCollection = {
	[Name in SyncCollectionName]: (typeof COLLECTION_VOCABULARY)[Name]['writeable'] extends true
		? Name
		: never;
}[SyncCollectionName];

export type EngineDocument = Record<string, unknown> & {
	id: string;
	payload?: Record<string, unknown>;
};

export type FieldKind = 'promoted' | 'payload' | 'computed' | 'identifier';

type WooOrderby = NonNullable<
	| OrderBrowseDimensions['orderby']
	| ProductBrowseDimensions['orderby']
	| CustomerBrowseDimensions['orderby']
>;

export type FieldMapEntry = {
	legacy: string;
	kind: FieldKind;
	enginePath: string;
	/** How a query-state filter reaches the remote lane; absent for non-filter fields. */
	wireFace?: 'dimension' | 'implied' | 'local-only';
	readEnginePath?: string;
	write?: (value: unknown) => unknown;
	adapterDerived?: boolean;
	numeric?: boolean;
	notes?: string;
	compute?: (document: EngineDocument) => unknown;
	sort?: {
		uiAlias?: string; // Canonical sort field for this persisted UI column key.
		wooOrderby?: WooOrderby; // Wire orderby; absent when server sorting is unsupported today.
		tiebreak?: readonly string[]; // Extra sort fields appended by the UI contract.
	};
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

function queryPayloadField<W extends NonNullable<FieldMapEntry['wireFace']>>(
	legacy: string,
	wireFace: W
) {
	return {
		legacy,
		kind: 'payload' as const,
		enginePath: `payload.${legacy}`,
		wireFace,
	};
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
			sku: {
				legacy: 'sku',
				kind: 'payload',
				enginePath: 'payload.sku',
				sort: { wooOrderby: 'sku' },
			},
			barcode: {
				legacy: 'barcode',
				kind: 'payload',
				enginePath: 'payload.barcode',
				sort: { wooOrderby: 'barcode' },
			},
			id: {
				legacy: 'id',
				kind: 'identifier',
				enginePath: 'wooProductId',
				adapterDerived: false,
				sort: { wooOrderby: 'id' },
			},
			name: {
				legacy: 'name',
				kind: 'payload',
				enginePath: 'payload.name',
				sort: { wooOrderby: 'title' },
			},
			// 1.9 catalog-order contract (#810): equal menu_order values (usually 0) are
			// common, so the Woo id tiebreak is part of the sort rather than an engine detail.
			menu_order: {
				legacy: 'menu_order',
				kind: 'payload',
				enginePath: 'payload.menu_order',
				sort: { wooOrderby: 'menu_order', tiebreak: ['id'] },
			},
			total_sales: {
				legacy: 'total_sales',
				kind: 'payload',
				enginePath: 'payload.total_sales',
				sort: { wooOrderby: 'popularity' },
			},
			date_created_gmt: {
				legacy: 'date_created_gmt',
				kind: 'payload',
				enginePath: 'payload.date_created_gmt',
				sort: { wooOrderby: 'date' },
			},
			date_modified_gmt: {
				legacy: 'date_modified_gmt',
				kind: 'payload',
				enginePath: 'payload.date_modified_gmt',
				sort: { wooOrderby: 'modified' },
			},
			stock_status: {
				legacy: 'stock_status',
				kind: 'promoted',
				enginePath: 'stockStatus',
				write: (value) => String(value ?? ''),
				wireFace: 'dimension',
				sort: { wooOrderby: 'stock_status' },
			},
			featured: {
				legacy: 'featured',
				kind: 'promoted',
				enginePath: 'featured',
				write: Boolean,
				wireFace: 'dimension',
			},
			on_sale: {
				legacy: 'on_sale',
				kind: 'promoted',
				enginePath: 'onSale',
				write: Boolean,
				wireFace: 'dimension',
			},
			categories: {
				legacy: 'categories',
				kind: 'promoted',
				enginePath: 'categoryIds',
				readEnginePath: 'payload.categories',
				write: (value) =>
					Array.isArray(value)
						? value
								.map((entry) => Number((entry as { id?: unknown } | null)?.id ?? entry))
								.filter((id) => Number.isFinite(id) && id > 0)
						: [],
				notes: 'Selectors use numeric membership; reads preserve Woo category objects.',
				wireFace: 'dimension',
			},
			tags: queryPayloadField('tags', 'dimension'),
			brands: {
				legacy: 'brands',
				kind: 'promoted',
				enginePath: 'brandIds',
				readEnginePath: 'payload.brands',
				write: (value) =>
					Array.isArray(value)
						? value
								.map((entry) => Number((entry as { id?: unknown } | null)?.id ?? entry))
								.filter((id) => Number.isFinite(id) && id > 0)
						: [],
				notes: 'Selectors use numeric membership; reads preserve Woo brand objects.',
				wireFace: 'dimension',
			},
			status: {
				legacy: 'status',
				kind: 'payload',
				enginePath: 'payload.status',
				notes: 'Synthetic Manager-test selector; no production product selector was observed.',
				wireFace: 'implied',
			},
			category: {
				legacy: 'category',
				kind: 'payload',
				enginePath: 'payload.category',
				notes: 'Synthetic Manager-test selector with no demonstrated product payload contract.',
			},
			type: {
				legacy: 'type',
				kind: 'promoted',
				enginePath: 'type',
				write: (value) => String(value ?? ''),
			},
			stock_quantity: {
				legacy: 'stock_quantity',
				kind: 'promoted',
				enginePath: 'stockQuantity',
				write: (value) => {
					if (value === null || value === undefined || value === '') return null;
					const numeric = Number(value);
					return Number.isFinite(numeric) ? numeric : null;
				},
				sort: { wooOrderby: 'stock_quantity' },
			},
			sortable_price: {
				legacy: 'sortable_price',
				kind: 'computed',
				enginePath: 'payload.price',
				numeric: true,
				notes: 'Numeric JS sort over the source string; never the cents-rounded promoted price.',
				compute: (document) => Number(valueAtPath(document, 'payload.price')),
				sort: { wooOrderby: 'price' },
			},
			price: {
				legacy: 'price',
				kind: 'promoted',
				enginePath: 'price',
				readEnginePath: 'payload.price',
				write: (value) => Math.max(0, Math.round((Number(value) || 0) * 100) / 100),
				numeric: true,
				notes: 'Promoted price is numeric cents precision; reads preserve the Woo string.',
				sort: { uiAlias: 'sortable_price', wooOrderby: 'price' },
			},
		},
	},
	variations: {
		engineCollection: 'variations',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			// Variations share the product catalog-order contract (#871).
			menu_order: {
				legacy: 'menu_order',
				kind: 'payload',
				enginePath: 'payload.menu_order',
				sort: { tiebreak: ['id'] },
			},
			id: {
				legacy: 'id',
				kind: 'identifier',
				enginePath: 'wooId',
				adapterDerived: false,
			},
			attributes: {
				legacy: 'attributes',
				kind: 'promoted',
				enginePath: 'attributes',
				readEnginePath: 'payload.attributes',
				write: (value) =>
					Array.isArray(value)
						? value
								.map((entry) => ({
									id: Number((entry as { id?: unknown } | null)?.id) || 0,
									name: String((entry as { name?: unknown } | null)?.name ?? ''),
									option: String((entry as { option?: unknown } | null)?.option ?? ''),
								}))
								.filter(({ name, option }) => name !== '' && option !== '')
						: [],
				notes: 'Selectors use normalized attributes; reads retain the source payload.',
				wireFace: 'local-only',
			},
			status: queryPayloadField('status', 'local-only'),
			price: {
				legacy: 'price',
				kind: 'promoted',
				enginePath: 'price',
				readEnginePath: 'payload.price',
				write: (value) => Number(value) || 0,
				numeric: true,
			},
			stock_quantity: {
				legacy: 'stock_quantity',
				kind: 'promoted',
				enginePath: 'stockQuantity',
				write: (value) => {
					if (value === null || value === undefined || value === '') return null;
					const numeric = Number(value);
					return Number.isFinite(numeric) ? numeric : null;
				},
			},
			stock_status: {
				legacy: 'stock_status',
				kind: 'promoted',
				enginePath: 'stockStatus',
				write: (value) => String(value ?? ''),
			},
			parent_id: {
				legacy: 'parent_id',
				kind: 'promoted',
				enginePath: 'parentId',
				write: (value) => {
					if (value === null || value === undefined || value === '') return null;
					const numeric = Number(value);
					return Number.isFinite(numeric) ? numeric : null;
				},
			},
		},
	},
	orders: {
		engineCollection: 'orders',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: {
				legacy: 'id',
				kind: 'identifier',
				enginePath: 'wooOrderId',
				adapterDerived: false,
				sort: { wooOrderby: 'id' },
			},
			status: {
				legacy: 'status',
				kind: 'promoted',
				enginePath: 'status',
				write: (value) => String(value ?? ''),
				sort: { wooOrderby: 'status' },
				wireFace: 'dimension',
			},
			customer_id: {
				legacy: 'customer_id',
				kind: 'promoted',
				enginePath: 'customerId',
				write: (value) => Number(value ?? 0),
				sort: { wooOrderby: 'customer_id' },
				wireFace: 'dimension',
			},
			date_created_gmt: {
				legacy: 'date_created_gmt',
				kind: 'promoted',
				enginePath: 'dateCreatedGmt',
				write: (value) => String(value ?? ''),
				sort: { wooOrderby: 'date' },
				wireFace: 'dimension',
			},
			date_modified_gmt: {
				legacy: 'date_modified_gmt',
				kind: 'payload',
				enginePath: 'payload.date_modified_gmt',
				sort: { wooOrderby: 'modified' },
			},
			number: {
				legacy: 'number',
				kind: 'promoted',
				enginePath: 'number',
				write: (value) => String(value ?? ''),
				sort: { wooOrderby: 'id' },
			},
			sortable_total: {
				legacy: 'sortable_total',
				kind: 'computed',
				enginePath: 'payload.total',
				numeric: true,
				notes: 'Numeric JS sort over the source string; no engine numeric total exists.',
				compute: (document) => Number(valueAtPath(document, 'payload.total')),
			},
			total: {
				legacy: 'total',
				kind: 'promoted',
				enginePath: 'total',
				write: (value) => String(value ?? ''),
				sort: { uiAlias: 'sortable_total', wooOrderby: 'total' },
			},
			payment_method: {
				legacy: 'payment_method',
				kind: 'payload',
				enginePath: 'payload.payment_method',
				sort: { wooOrderby: 'payment_method' },
			},
			cashier: {
				legacy: 'cashier',
				kind: 'computed',
				enginePath: 'payload.meta_data',
				notes: 'Value of the _pos_user metadata entry.',
				compute: (document) => metadataValue(document, '_pos_user'),
				wireFace: 'dimension',
			},
			store: {
				legacy: 'store',
				kind: 'computed',
				enginePath: 'payload.meta_data',
				adapterDerived: false,
				wireFace: 'dimension',
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
	/**
	 * Customers (#951, #1028 follow-on). Every column with a `wooOrderby` drives a SERVER-sorted
	 * browse window; a column without one keeps sorting local residents.
	 *
	 * `syncBaseUrl` is the `wcpos/v2` namespace, whose `/customers` route proxies to
	 * `wc/v3/customers`. `id`, `name` and `registered_date` are wc/v3-native. `first_name`,
	 * `last_name`, `email`, `username` and `role` are re-applied by the proxy through the V1
	 * customer handler (plugin #1488), so they now reach the wire too — restoring the 1.9
	 * server-side sort the v2 layer had temporarily withheld.
	 *
	 * `role` sorts by STAFF HIERARCHY server-side (plugin #1500), NOT alphabetically. The client
	 * passes `orderby=role` and does no rank mapping — hence no `enginePath`-based rank here, the
	 * wire orderby is the whole contract.
	 */
	customers: {
		engineCollection: 'customers',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: {
				legacy: 'id',
				kind: 'identifier',
				enginePath: 'wooCustomerId',
				adapterDerived: false,
				sort: { wooOrderby: 'id' },
			},
			/** 1.9 parity: `hooks/customers.tsx` mapped `date_created`/`date_created_gmt` here. */
			date_created_gmt: {
				legacy: 'date_created_gmt',
				kind: 'payload',
				enginePath: 'payload.date_created_gmt',
				sort: { wooOrderby: 'registered_date' },
			},
			first_name: {
				legacy: 'first_name',
				kind: 'payload',
				enginePath: 'payload.first_name',
				sort: { wooOrderby: 'first_name' },
			},
			last_name: {
				legacy: 'last_name',
				kind: 'payload',
				enginePath: 'payload.last_name',
				sort: { wooOrderby: 'last_name' },
			},
			email: {
				legacy: 'email',
				kind: 'payload',
				enginePath: 'payload.email',
				sort: { wooOrderby: 'email' },
			},
			username: {
				legacy: 'username',
				kind: 'payload',
				enginePath: 'payload.username',
				sort: { wooOrderby: 'username' },
			},
			/**
			 * Server-side staff-hierarchy sort (plugin #1500). The client only forwards
			 * `orderby=role`; the local `payload.role` path is a plain value read, never a rank —
			 * a local alphabetical sort here would disagree with the server's hierarchy order.
			 */
			role: {
				legacy: 'role',
				kind: 'payload',
				enginePath: 'payload.role',
				sort: { wooOrderby: 'role' },
			},
		},
	},
	taxes: {
		engineCollection: 'taxRates',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: {
				legacy: 'id',
				kind: 'identifier',
				enginePath: 'wooTaxRateId',
				adapterDerived: false,
			},
		},
	},
	'products/categories': {
		engineCollection: 'categories',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: {
				legacy: 'id',
				kind: 'identifier',
				enginePath: 'wooId',
				adapterDerived: false,
			},
		},
	},
	'products/tags': {
		engineCollection: 'tags',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: {
				legacy: 'id',
				kind: 'identifier',
				enginePath: 'wooId',
				adapterDerived: false,
			},
		},
	},
	'products/brands': {
		engineCollection: 'brands',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: {
				legacy: 'id',
				kind: 'identifier',
				enginePath: 'wooId',
				adapterDerived: false,
			},
		},
	},
	coupons: {
		engineCollection: 'coupons',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
			id: {
				legacy: 'id',
				kind: 'identifier',
				enginePath: 'wooId',
				adapterDerived: false,
			},
			discount_type: queryPayloadField('discount_type', 'local-only'),
			status: queryPayloadField('status', 'local-only'),
			date_expires_gmt: queryPayloadField('date_expires_gmt', 'local-only'),
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

/** True when a legacy collection name is served by the engine adapter (everything
 * except the local-only `logs` and the dedicated `templates` path). */
export function isMappedCollection(name: string): name is LegacyCollectionName {
	return Object.prototype.hasOwnProperty.call(collectionMap, name);
}

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
		}
	);
}

export function sortAliasFor(collection: LegacyCollectionName, field: string): string | undefined {
	return resolveLegacyField(collection, field).sort?.uiAlias;
}

type WooOrderbyFor<C extends LegacyCollectionName> = C extends 'products'
	? NonNullable<ProductBrowseDimensions['orderby']>
	: C extends 'orders'
		? NonNullable<OrderBrowseDimensions['orderby']>
		: C extends 'customers'
			? NonNullable<CustomerBrowseDimensions['orderby']>
			: WooOrderby;

export function wooOrderbyFor<C extends LegacyCollectionName>(
	collection: C,
	field: string
): WooOrderbyFor<C> | undefined {
	return resolveLegacyField(collection, field).sort?.wooOrderby as WooOrderbyFor<C> | undefined;
}

export function sortTiebreakFor(
	collection: LegacyCollectionName,
	field: string
): readonly string[] | undefined {
	return resolveLegacyField(collection, field).sort?.tiebreak;
}

export function promotedColumnsFor(
	collection: LegacyCollectionName,
	legacyPayload: Record<string, unknown>
): Record<string, unknown> {
	const fields = Object.values(collectionMap[collection].fields as Record<string, FieldMapEntry>);
	return Object.fromEntries(
		fields
			.filter((field) => field.kind === 'promoted')
			.map((field) => [
				field.enginePath,
				field.write ? field.write(legacyPayload[field.legacy]) : legacyPayload[field.legacy],
			])
	);
}

export function adapterDerivedFieldsFor(collection: LegacyCollectionName): readonly string[] {
	const fields = Object.values(collectionMap[collection].fields as Record<string, FieldMapEntry>);
	return fields
		.filter(
			(field) => field.adapterDerived ?? (field.kind === 'identifier' || field.kind === 'computed')
		)
		.map((field) => field.legacy);
}

/** The engine RxDB collection name backing a legacy collection (`taxes` →
 * `taxRates`, `products/categories` → `categories`, …). */
export function engineCollectionNameFor(collection: LegacyCollectionName): EngineCollectionName {
	return collectionMap[collection].engineCollection;
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
