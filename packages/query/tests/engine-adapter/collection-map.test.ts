import { SYNC_COLLECTION_NAMES } from '@wcpos/sync-engine';

import {
	adapterDerivedFieldsFor,
	COLLECTION_VOCABULARY,
	collectionMap,
	promotedColumnsFor,
	readLegacyField,
	readSanitizedFieldsFor,
	resolveLegacyField,
	sanitizeVariationAttributesRead,
	sortAliasFor,
	sortTiebreakFor,
	wooOrderbyFor,
} from '../../src/engine-adapter/collection-map';

describe('variation attribute read boundary (#811)', () => {
	const read = (attributes?: unknown, present = true) =>
		readLegacyField(
			'variations',
			{
				id: 'variation-1',
				payload: present ? { attributes } : {},
			},
			'attributes'
		);

	it('preserves valid payload entries unchanged', () => {
		const attributes = [
			{ id: '1', name: 'Color', option: 'Red', anyExtra: true },
			{ id: 2, name: 'Size', option: '' },
		];
		expect(read(attributes)).toEqual(attributes);
	});

	it('drops entries missing a name or option', () => {
		expect(read([{ option: 'Red' }, { name: 'Size' }, { name: 'Color', option: 'Blue' }])).toEqual([
			{ name: 'Color', option: 'Blue' },
		]);
	});

	it('drops entries with non-string names or options', () => {
		expect(
			read([
				{ name: 123, option: 'Red' },
				{ name: 'Size', option: 456 },
				{ name: { rendered: 'Color' }, option: 'Red' },
				{ name: 'Material', option: { rendered: 'Cotton' } },
			])
		).toEqual([]);
	});

	it.each(['junk', { name: 'Color', option: 'Red' }, null])(
		'returns [] for non-array input %#',
		(value) => expect(read(value)).toEqual([])
	);

	it('preserves empty and absent input', () => {
		expect(read([])).toEqual([]);
		expect(read(undefined, false)).toBeUndefined();
		expect(sanitizeVariationAttributesRead(undefined)).toBeUndefined();
		expect(readSanitizedFieldsFor('variations')).toEqual(['attributes']);
	});
});

describe('engine adapter collection map', () => {
	it('pins collection-name facts to the previous hand-written maps', () => {
		const entries = Object.entries(COLLECTION_VOCABULARY);
		expect(Object.fromEntries(entries.map(([name, row]) => [row.telemetryName, name]))).toEqual({
			products: 'products',
			variations: 'variations',
			orders: 'orders',
			customers: 'customers',
			categories: 'categories',
			brands: 'brands',
			tags: 'tags',
			coupons: 'coupons',
			tax_rates: 'taxRates',
		});
		expect(Object.fromEntries(entries.map(([name, row]) => [name, row.legacyName]))).toEqual({
			products: 'products',
			variations: 'variations',
			orders: 'orders',
			customers: 'customers',
			categories: 'products/categories',
			brands: 'products/brands',
			tags: 'products/tags',
			coupons: 'coupons',
			taxRates: 'taxes',
		});
		expect(Object.fromEntries(entries.map(([name, row]) => [name, row.labelKey]))).toEqual({
			products: 'common.products',
			variations: 'common.variations',
			orders: 'common.orders',
			customers: 'common.customers',
			categories: 'common.categories',
			brands: 'common.brands',
			tags: 'common.tags',
			coupons: 'common.coupons',
			taxRates: 'common.tax_rates',
		});
		expect(Object.fromEntries(entries.map(([name, row]) => [row.legacyName, name]))).toEqual({
			products: 'products',
			variations: 'variations',
			orders: 'orders',
			customers: 'customers',
			taxes: 'taxRates',
			'products/categories': 'categories',
			'products/tags': 'tags',
			'products/brands': 'brands',
			coupons: 'coupons',
		});
		expect(Object.fromEntries(SYNC_COLLECTION_NAMES.map((name) => [name, null]))).toEqual({
			orders: null,
			products: null,
			variations: null,
			customers: null,
			taxRates: null,
			categories: null,
			brands: null,
			tags: null,
			coupons: null,
		});
		expect(Object.fromEntries(entries.map(([name, row]) => [name, row.censusRoute]))).toEqual({
			orders: 'wc/v3/orders',
			products: 'wc/v3/products',
			variations: 'wcpos/v1/products/variations',
			customers: 'wcpos/v2/customers',
			taxRates: 'wcpos/v2/taxes',
			categories: 'wc/v3/products/categories',
			brands: 'wc/v3/products/brands',
			tags: 'wc/v3/products/tags',
			coupons: 'wc/v3/coupons',
		});
		expect(Object.fromEntries(entries.map(([name, row]) => [name, row.writeable]))).toEqual({
			orders: true,
			products: true,
			variations: true,
			customers: true,
			taxRates: false,
			categories: false,
			brands: false,
			tags: false,
			coupons: true,
		});
	});

	it('reverses legacy and engine identifiers per collection', () => {
		expect(resolveLegacyField('products', 'uuid')).toMatchObject({
			kind: 'identifier',
			enginePath: 'id',
		});
		expect(resolveLegacyField('products', 'id')).toMatchObject({
			kind: 'identifier',
			enginePath: 'wooProductId',
		});
		expect(resolveLegacyField('orders', 'id').enginePath).toBe('wooOrderId');
		expect(resolveLegacyField('customers', 'id').enginePath).toBe('wooCustomerId');
		expect(resolveLegacyField('taxes', 'id').enginePath).toBe('wooTaxRateId');
		expect(resolveLegacyField('products/categories', 'id').enginePath).toBe('wooId');
	});

	it('maps each legacy collection to its engine collection', () => {
		expect(
			Object.fromEntries(
				Object.entries(collectionMap).map(([legacy, entry]) => [legacy, entry.engineCollection])
			)
		).toEqual({
			products: 'products',
			variations: 'variations',
			orders: 'orders',
			customers: 'customers',
			taxes: 'taxRates',
			'products/categories': 'categories',
			'products/tags': 'tags',
			'products/brands': 'brands',
			coupons: 'coupons',
		});
	});

	it('exposes explicit camel-case, computed, and numeric-sort entries', () => {
		expect(resolveLegacyField('products', 'stock_status')).toMatchObject({
			kind: 'promoted',
			enginePath: 'stockStatus',
		});
		expect(resolveLegacyField('orders', 'date_created_gmt').enginePath).toBe('dateCreatedGmt');
		expect(resolveLegacyField('orders', 'cashier').kind).toBe('computed');
		expect(resolveLegacyField('coupons', 'active').kind).toBe('computed');
		expect(resolveLegacyField('products', 'sortable_price')).toMatchObject({
			kind: 'computed',
			enginePath: 'payload.price',
			numeric: true,
		});
		expect(resolveLegacyField('orders', 'sortable_total')).toMatchObject({
			kind: 'computed',
			enginePath: 'payload.total',
			numeric: true,
		});
	});

	it('pins the declared sort vocabulary', () => {
		const declaredValues = (
			collection: 'products' | 'variations' | 'orders',
			accessor: (collection: 'products' | 'variations' | 'orders', field: string) => unknown
		) =>
			Object.fromEntries(
				Object.keys(collectionMap[collection].fields)
					.map((field) => [field, accessor(collection, field)] as const)
					.filter((entry) => entry[1] !== undefined)
			);

		expect(declaredValues('products', sortAliasFor)).toEqual({
			price: 'sortable_price',
		});
		expect(declaredValues('orders', sortAliasFor)).toEqual({
			total: 'sortable_total',
		});
		expect(declaredValues('products', sortTiebreakFor)).toEqual({
			menu_order: ['id'],
		});
		expect(declaredValues('variations', sortTiebreakFor)).toEqual({
			menu_order: ['id'],
		});
		expect(declaredValues('orders', sortTiebreakFor)).toEqual({});
		expect(declaredValues('products', wooOrderbyFor)).toEqual({
			sku: 'sku',
			barcode: 'barcode',
			menu_order: 'menu_order',
			id: 'id',
			name: 'title',
			price: 'price',
			sortable_price: 'price',
			total_sales: 'popularity',
			date_created_gmt: 'date',
			date_modified_gmt: 'modified',
			stock_status: 'stock_status',
			stock_quantity: 'stock_quantity',
		});
		expect(declaredValues('orders', wooOrderbyFor)).toEqual({
			status: 'status',
			customer_id: 'customer_id',
			date_created_gmt: 'date',
			date_modified_gmt: 'modified',
			number: 'id',
			id: 'id',
			total: 'total',
			payment_method: 'payment_method',
		});
	});

	it('falls back explicitly to the payload for unlisted fields', () => {
		expect(resolveLegacyField('products', 'custom_field')).toEqual({
			legacy: 'custom_field',
			kind: 'payload',
			enginePath: 'payload.custom_field',
		});
	});

	it('reproduces promoted order columns from the legacy payload', () => {
		expect(
			promotedColumnsFor('orders', {
				number: 17,
				date_created_gmt: null,
				status: undefined,
				total: '12.34',
				customer_id: '42',
			})
		).toEqual({
			number: '17',
			dateCreatedGmt: '',
			status: '',
			total: '12.34',
			customerId: 42,
		});
	});

	it('reproduces promoted product and variation coercions', () => {
		expect(
			promotedColumnsFor('products', {
				price: '12.345',
				stock_status: null,
				type: 7,
				categories: [{ id: '3' }, 5, { id: 0 }, null],
				brands: undefined,
				on_sale: 0,
				featured: 'yes',
				stock_quantity: '',
			})
		).toEqual({
			price: 12.35,
			stockStatus: '',
			type: '7',
			categoryIds: [3, 5],
			brandIds: [],
			onSale: false,
			featured: true,
			stockQuantity: null,
		});

		expect(
			promotedColumnsFor('variations', {
				parent_id: 'bad',
				price: '-4.25',
				stock_status: 'instock',
				attributes: [
					{ id: '2', name: 'Size', option: 'Large' },
					{ id: null, name: '', option: 'ignored' },
				],
				stock_quantity: '8',
			})
		).toEqual({
			parentId: null,
			price: -4.25,
			stockStatus: 'instock',
			attributes: [{ id: 2, name: 'Size', option: 'Large' }],
			stockQuantity: 8,
		});
	});

	it('derives only adapter-owned identity and computed legacy fields', () => {
		expect(adapterDerivedFieldsFor('products')).toEqual(['uuid', 'sortable_price']);
		expect(adapterDerivedFieldsFor('variations')).toEqual(['uuid']);
		expect(adapterDerivedFieldsFor('orders')).toEqual([
			'uuid',
			'sortable_total',
			'cashier',
			'select',
		]);
		expect(adapterDerivedFieldsFor('customers')).toEqual(['uuid']);
		expect(adapterDerivedFieldsFor('coupons')).toEqual(['uuid', 'active']);
	});

	it('keeps explicit rows only when payload fallback cannot reproduce the entry', () => {
		for (const entry of Object.values(collectionMap)) {
			for (const field of Object.values(entry.fields)) {
				const fallbackKeys = ['enginePath', 'kind', 'legacy'];
				const isPayloadIdentity =
					field.kind === 'payload' && field.enginePath === `payload.${field.legacy}`;
				expect(
					isPayloadIdentity && Object.keys(field).every((key) => fallbackKeys.includes(key))
				).toBe(false);
			}
		}
	});
});
