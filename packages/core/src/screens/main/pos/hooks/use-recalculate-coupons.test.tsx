/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';

import { recalculateCoupons } from './coupon-recalculate';
import { useRecalculateCoupons } from './use-recalculate-coupons';

const engine = {
	active: jest.fn(),
};

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({ engine }),
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		store: {
			woocommerce_calc_discounts_sequentially$: new BehaviorSubject('no'),
			calc_discounts_sequentially$: new BehaviorSubject('no'),
		},
	}),
}));

jest.mock('../../contexts/tax-rates', () => ({
	useTaxRates: () => ({
		rates: [],
		pricesIncludeTax: false,
		taxRoundAtSubtotal: false,
		priceNumDecimals: 2,
	}),
}));

jest.mock('../../hooks/use-collection', () => ({
	useCollection: () => {
		throw new Error('legacy storeDB read');
	},
}));

type EngineDocument = Record<string, unknown> & {
	id: string;
	payload: Record<string, unknown>;
};

function engineDocument(document: EngineDocument) {
	return {
		...document,
		$: of(document),
		collection: { name: 'engine' },
		getLatest: () => engineDocument(document),
		toJSON: () => document,
	};
}

const lineItems = [
	{
		product_id: 83,
		quantity: 1,
		subtotal: '18',
		subtotal_tax: '0',
		total: '18',
		total_tax: '0',
		taxes: [],
		meta_data: [
			{
				key: '_woocommerce_pos_data',
				value: JSON.stringify({ price: '18', regular_price: '20', tax_status: 'taxable' }),
			},
		],
	},
	{
		product_id: 82,
		quantity: 1,
		subtotal: '18',
		subtotal_tax: '0',
		total: '18',
		total_tax: '0',
		taxes: [],
		meta_data: [
			{
				key: '_woocommerce_pos_data',
				value: JSON.stringify({ price: '18', regular_price: '18', tax_status: 'taxable' }),
			},
		],
	},
] as NonNullable<import('@wcpos/database').OrderDocument['line_items']>;

function installEngineFixture(couponPayload: Record<string, unknown>) {
	const coupon = engineDocument({ id: 'coupon-uuid', wooId: 501, payload: couponPayload });
	const products = [
		engineDocument({
			id: 'product-83',
			wooProductId: 83,
			payload: { id: 83, categories: [{ id: 19 }] },
		}),
		engineDocument({
			id: 'product-82',
			wooProductId: 82,
			payload: { id: 82, categories: [{ id: 17 }] },
		}),
	];
	const categories = [
		engineDocument({ id: 'category-16', wooId: 16, payload: { id: 16, parent: 0 } }),
		engineDocument({ id: 'category-17', wooId: 17, payload: { id: 17, parent: 16 } }),
		engineDocument({ id: 'category-19', wooId: 19, payload: { id: 19, parent: 0 } }),
	];
	const couponFind = jest.fn(() => ({ exec: async () => [coupon] }));
	const productFind = jest.fn(() => ({ exec: async () => products }));
	const categoryFind = jest.fn(() => ({ exec: async () => categories }));

	engine.active.mockReturnValue({
		database: {
			collections: {
				coupons: { find: couponFind },
				products: { find: productFind },
				categories: { find: categoryFind },
			},
		},
	});

	return { couponFind, productFind, categoryFind };
}

function couponConfig(overrides: Record<string, unknown>) {
	return {
		discount_type: 'fixed_product' as const,
		amount: '2',
		limit_usage_to_x_items: null,
		product_ids: [],
		excluded_product_ids: [],
		product_categories: [],
		excluded_product_categories: [],
		exclude_sale_items: false,
		...overrides,
	};
}

describe('useRecalculateCoupons engine reads', () => {
	beforeEach(() => engine.active.mockReset());

	it('matches the legacy replay fixture for a category restriction that requires ancestors', async () => {
		const config = couponConfig({ product_categories: [16, 19] });
		const reads = installEngineFixture({ code: 'fixed2clothacc', ...config });
		const couponLines = [
			{ code: 'fixed2clothacc', discount: '0', discount_tax: '0', meta_data: [] },
		] as NonNullable<import('@wcpos/database').OrderDocument['coupon_lines']>;
		const expected = recalculateCoupons({
			lineItems,
			couponLines,
			couponConfigs: new Map([['fixed2clothacc', config]]),
			pricesIncludeTax: false,
			calcDiscountsSequentially: false,
			taxRates: [],
			productCategories: new Map([
				[83, [{ id: 19 }]],
				[82, [{ id: 17 }, { id: 16 }]],
			]),
			taxRoundAtSubtotal: false,
			dp: 2,
		});
		const { result } = renderHook(() => useRecalculateCoupons());

		await expect(result.current.recalculate(lineItems, couponLines)).resolves.toEqual(expected);
		expect(reads.productFind).toHaveBeenCalledWith({
			selector: { wooProductId: { $in: [83, 82] } },
		});
		expect(reads.categoryFind).toHaveBeenCalledWith();
	});

	it('matches the legacy replay fixture for a direct product restriction', async () => {
		const config = couponConfig({ product_ids: [82] });
		installEngineFixture({ code: 'tshirt-only', ...config });
		const couponLines = [
			{ code: 'tshirt-only', discount: '0', discount_tax: '0', meta_data: [] },
		] as NonNullable<import('@wcpos/database').OrderDocument['coupon_lines']>;
		const expected = recalculateCoupons({
			lineItems,
			couponLines,
			couponConfigs: new Map([['tshirt-only', config]]),
			pricesIncludeTax: false,
			calcDiscountsSequentially: false,
			taxRates: [],
			productCategories: new Map([
				[83, [{ id: 19 }]],
				[82, [{ id: 17 }, { id: 16 }]],
			]),
			taxRoundAtSubtotal: false,
			dp: 2,
		});
		const { result } = renderHook(() => useRecalculateCoupons());

		await expect(result.current.recalculate(lineItems, couponLines)).resolves.toEqual(expected);
	});
});
