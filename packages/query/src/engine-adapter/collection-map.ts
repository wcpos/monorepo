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
	write?: (value: unknown) => unknown;
	adapterDerived?: boolean;
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
			id: {
				legacy: 'id',
				kind: 'identifier',
				enginePath: 'wooProductId',
				adapterDerived: false,
			},
			stock_status: {
				legacy: 'stock_status',
				kind: 'promoted',
				enginePath: 'stockStatus',
				write: (value) => String(value ?? ''),
			},
			featured: {
				legacy: 'featured',
				kind: 'promoted',
				enginePath: 'featured',
				write: Boolean,
			},
			on_sale: {
				legacy: 'on_sale',
				kind: 'promoted',
				enginePath: 'onSale',
				write: Boolean,
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
			},
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
			},
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
			},
			sortable_price: {
				legacy: 'sortable_price',
				kind: 'computed',
				enginePath: 'payload.price',
				numeric: true,
				notes: 'Numeric JS sort over the source string; never the cents-rounded promoted price.',
				compute: (document) => Number(valueAtPath(document, 'payload.price')),
			},
			price: {
				legacy: 'price',
				kind: 'promoted',
				enginePath: 'price',
				readEnginePath: 'payload.price',
				write: (value) => Math.max(0, Math.round((Number(value) || 0) * 100) / 100),
				numeric: true,
				notes: 'Promoted price is numeric cents precision; reads preserve the Woo string.',
			},
		},
	},
	variations: {
		engineCollection: 'variations',
		fields: {
			uuid: { legacy: 'uuid', kind: 'identifier', enginePath: 'id' },
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
			},
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
			},
			status: {
				legacy: 'status',
				kind: 'promoted',
				enginePath: 'status',
				write: (value) => String(value ?? ''),
			},
			customer_id: {
				legacy: 'customer_id',
				kind: 'promoted',
				enginePath: 'customerId',
				write: (value) => Number(value ?? 0),
			},
			date_created_gmt: {
				legacy: 'date_created_gmt',
				kind: 'promoted',
				enginePath: 'dateCreatedGmt',
				write: (value) => String(value ?? ''),
			},
			number: {
				legacy: 'number',
				kind: 'promoted',
				enginePath: 'number',
				write: (value) => String(value ?? ''),
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
			},
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
			id: {
				legacy: 'id',
				kind: 'identifier',
				enginePath: 'wooCustomerId',
				adapterDerived: false,
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

export const LEGACY_COLLECTION_NAMES = Object.keys(collectionMap) as LegacyCollectionName[];

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
			fallback: true,
		}
	);
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
