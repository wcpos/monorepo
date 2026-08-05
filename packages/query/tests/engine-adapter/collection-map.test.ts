import {
	adapterDerivedFieldsFor,
	collectionMap,
	promotedColumnsFor,
	resolveLegacyField,
} from '../../src/engine-adapter/collection-map';

describe('engine adapter collection map', () => {
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
