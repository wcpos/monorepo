/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { of } from 'rxjs';

import { useAddCoupon } from './use-add-coupon';

jest.mock('uuid', () => ({ v4: () => 'coupon-line-uuid' }));

const engine = { active: jest.fn() };
const localPatch = jest.fn();
const recalculate = jest.fn();

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({ engine }),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
}));

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch }),
}));

jest.mock('./use-recalculate-coupons', () => ({
	useRecalculateCoupons: () => ({ recalculate }),
}));

jest.mock('../../hooks/use-collection', () => ({
	useCollection: () => {
		throw new Error('legacy storeDB read');
	},
}));

const orderSnapshot = {
	uuid: 'order-uuid',
	id: 99,
	number: '99',
	line_items: [
		{
			product_id: 82,
			quantity: 1,
			subtotal: '18',
			total: '18',
			meta_data: [
				{
					key: '_woocommerce_pos_data',
					value: JSON.stringify({ price: '18', regular_price: '18' }),
				},
			],
		},
	],
	coupon_lines: [{ code: 'solo', discount: '0', discount_tax: '0', meta_data: [] }],
	billing: { email: 'shopper@example.com' },
	customer_id: 7,
};

const currentOrder = {
	...orderSnapshot,
	getLatest: () => orderSnapshot,
};

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrder }),
}));

function engineDocument(document: Record<string, unknown> & { id: string; payload: object }) {
	return {
		...document,
		$: of(document),
		collection: { name: 'engine' },
		getLatest: () => engineDocument(document),
		toJSON: () => document,
	};
}

function couponPayload(code: string, individualUse: boolean) {
	return {
		code,
		individual_use: individualUse,
		discount_type: 'percent',
		amount: '10',
		product_ids: [],
		excluded_product_ids: [],
		product_categories: [],
		excluded_product_categories: [],
		exclude_sale_items: false,
		usage_limit: null,
		usage_count: 0,
		usage_limit_per_user: null,
		used_by: [],
		minimum_amount: '',
		maximum_amount: '',
		email_restrictions: [],
	};
}

describe('useAddCoupon engine reads', () => {
	beforeEach(() => {
		localPatch.mockReset();
		recalculate.mockReset();
		const coupons = [
			engineDocument({ id: 'coupon-bonus', wooId: 1, payload: couponPayload('bonus', false) }),
			engineDocument({ id: 'coupon-solo', wooId: 2, payload: couponPayload('solo', true) }),
		];
		const products = [
			engineDocument({
				id: 'product-82',
				wooProductId: 82,
				payload: { id: 82, categories: [{ id: 17 }] },
			}),
		];
		engine.active.mockReturnValue({
			database: {
				collections: {
					coupons: { find: jest.fn(() => ({ exec: async () => coupons })) },
					products: { find: jest.fn(() => ({ exec: async () => products })) },
					categories: { find: jest.fn(() => ({ exec: async () => [] })) },
				},
			},
		});
	});

	it('preserves trimmed lowercase lookup and rejects against an applied individual-use coupon', async () => {
		const { result } = renderHook(() => useAddCoupon());

		await expect(result.current.addCoupon('  BoNuS  ')).resolves.toEqual({
			success: false,
			error: 'Coupon "solo" cannot be used with other coupons.',
		});
		expect(recalculate).not.toHaveBeenCalled();
		expect(localPatch).not.toHaveBeenCalled();
	});
});
