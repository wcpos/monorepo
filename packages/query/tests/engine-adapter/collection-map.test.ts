import {
	collectionMap,
	legacyFieldForEnginePath,
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
		expect(legacyFieldForEnginePath('products', 'wooProductId')).toBe('id');
		expect(legacyFieldForEnginePath('products', 'id')).toBe('uuid');
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
			fallback: true,
		});
	});

	it.each([
		[
			'products',
			[
				'uuid',
				'id',
				'stock_status',
				'featured',
				'on_sale',
				'categories',
				'brands',
				'tags',
				'meta_data',
				'name',
				'status',
				'category',
				'sku',
				'barcode',
				'type',
				'stock_quantity',
				'date_created_gmt',
				'sortable_price',
				'date_modified_gmt',
				'total_sales',
				'menu_order',
				'price',
				'regular_price',
				'sale_price',
				'tax_status',
				'tax_class',
				'manage_stock',
				'attributes',
				'images',
				'grouped_products',
				'variations',
				'cost_of_goods_sold',
				'slug',
			],
		],
		[
			'variations',
			[
				'uuid',
				'id',
				'attributes',
				'name',
				'sku',
				'barcode',
				'price',
				'regular_price',
				'sale_price',
				'on_sale',
				'tax_status',
				'tax_class',
				'stock_quantity',
				'manage_stock',
				'stock_status',
				'image',
				'cost_of_goods_sold',
				'date_created_gmt',
				'date_modified_gmt',
				'parent_id',
			],
		],
		[
			'orders',
			[
				'uuid',
				'id',
				'status',
				'customer_id',
				'date_created_gmt',
				'meta_data',
				'created_via',
				'number',
				'payment_method',
				'sortable_total',
				'billing',
				'shipping',
				'payment_method_title',
				'total',
				'currency_symbol',
				'refunds',
				'customer_note',
				'date_modified_gmt',
				'date_completed_gmt',
				'date_paid_gmt',
				'discount_total',
				'total_tax',
				'needs_payment',
				'tax_lines',
				'shipping_lines',
				'line_items',
				'slug',
				'cashier',
				'select',
			],
		],
		[
			'customers',
			[
				'uuid',
				'id',
				'role',
				'last_name',
				'first_name',
				'email',
				'username',
				'date_created_gmt',
				'date_modified_gmt',
				'avatar_url',
				'billing',
				'shipping',
				'slug',
			],
		],
		[
			'taxes',
			[
				'uuid',
				'id',
				'country',
				'state',
				'postcodes',
				'cities',
				'rate',
				'name',
				'priority',
				'compound',
				'shipping',
				'class',
				'order',
			],
		],
		['products/categories', ['uuid', 'id', 'name', 'parent']],
		['products/tags', ['uuid', 'id', 'name']],
		['products/brands', ['uuid', 'id', 'name', 'parent']],
		[
			'coupons',
			[
				'uuid',
				'id',
				'status',
				'discount_type',
				'date_expires_gmt',
				'code',
				'date_created_gmt',
				'date_modified_gmt',
				'amount',
				'description',
				'usage_count',
				'usage_limit',
				'slug',
				'active',
			],
		],
	] as const)('contains every census field for %s', (collection, expectedFields) => {
		expect(Object.keys(collectionMap[collection].fields).sort()).toEqual(
			[...expectedFields].sort()
		);
	});
});
