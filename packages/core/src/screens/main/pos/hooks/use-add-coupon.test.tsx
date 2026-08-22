/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { of } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';

import { useAddCoupon } from './use-add-coupon';

jest.mock('uuid', () => ({ v4: () => 'coupon-line-uuid' }));

const engine = { active: jest.fn() };
const localPatch = jest.fn();
const recalculate = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerSuccess = jest.fn();

jest.mock('@wcpos/utils/logger', () => {
	const logger = {
		get error() {
			return mockLoggerError;
		},
		get warn() {
			return mockLoggerWarn;
		},
		get info() {
			return mockLoggerInfo;
		},
		get success() {
			return mockLoggerSuccess;
		},
		with: () => logger,
	};
	return {
		getLogger: () => logger,
		getErrorMessage: (error: unknown) => {
			if (error instanceof Error) return error.message;
			return String(error);
		},
	};
});

jest.mock('@wcpos/utils/logger/generated/error-codes.generated', () => ({
	ERROR_CODES: { CART_UPDATE_FAILED: 'CART_UPDATE_FAILED' },
}));

jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQueryRuntime: () => ({ engine }),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () =>
		jest
			.requireActual<typeof import('../../../../../jest/translate')>(
				'../../../../../jest/translate'
			)
			.createTestT(),
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

const baseOrderSnapshot = {
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

/** Mutable per-test copy — tests override customer_id, billing and coupon_lines. */
let orderSnapshot: typeof baseOrderSnapshot = { ...baseOrderSnapshot };

const currentOrderRecord = {
	uuid: baseOrderSnapshot.uuid,
	get payload() {
		return orderSnapshot;
	},
	getLatest: () => currentOrderRecord,
};

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord }),
}));

function engineDocument(document: Record<string, unknown> & { uuid: string; payload: object }) {
	return {
		...document,
		$: of(document),
		collection: { name: 'engine' },
		getLatest: () => engineDocument(document),
		toJSON: () => document,
	};
}

function couponPayload(
	code: string,
	individualUse: boolean,
	overrides: Record<string, unknown> = {}
) {
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
		...overrides,
	};
}

function mockEngineData(coupons: ReturnType<typeof engineDocument>[]) {
	const products = [
		engineDocument({
			uuid: 'product-82',
			remoteId: '82',
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
}

describe('useAddCoupon engine reads', () => {
	beforeEach(() => {
		localPatch.mockReset();
		recalculate.mockReset();
		orderSnapshot = { ...baseOrderSnapshot };
		mockEngineData([
			engineDocument({
				uuid: 'coupon-bonus',
				remoteId: '1',
				payload: couponPayload('bonus', false),
			}),
			engineDocument({ uuid: 'coupon-solo', remoteId: '2', payload: couponPayload('solo', true) }),
		]);
	});

	it('preserves trimmed lowercase lookup and rejects against an applied individual-use coupon', async () => {
		const { result } = renderHook(() => useAddCoupon());

		await expect(result.current.addCoupon('  BoNuS  ')).resolves.toEqual({
			success: false,
			error: 'Coupon "solo" cannot be used with other coupons.',
		});
		expect(recalculate).not.toHaveBeenCalled();
		expect(localPatch).not.toHaveBeenCalled();
		expect(getLogger([]).warn).toHaveBeenCalledWith(
			'Coupon application rejected',
			expect.objectContaining({
				context: expect.objectContaining({
					event: 'coupon.rejected',
					couponCode: 'bonus',
					reason: 'Coupon "solo" cannot be used with other coupons.',
				}),
			})
		);
	});

	it('returns and reports the message when a local dependency throws', async () => {
		engine.active.mockImplementationOnce(() => {
			throw new Error('kaboom');
		});
		const { result } = renderHook(() => useAddCoupon());

		await expect(result.current.addCoupon('bonus')).resolves.toEqual({
			success: false,
			error: 'kaboom',
		});
		expect(mockLoggerError).toHaveBeenCalledWith('Local mutation failed', {
			showToast: true,
			code: 'CART_UPDATE_FAILED',
			toast: { title: 'There was an error: kaboom' },
			context: { error: 'kaboom' },
		});
	});
});

/**
 * Guest orders carry `customer_id: 0`. WooCommerce records guest coupon usage by
 * billing email and never as customer `0`, so the hook must collapse `0 → null`
 * before validating — passing `0` straight through silently disables per-user
 * usage limits for every guest sale (#976).
 */
describe('useAddCoupon per-user usage limits', () => {
	const GUEST_EMAIL = 'shopper@example.com';

	beforeEach(() => {
		localPatch.mockReset();
		recalculate.mockReset();
		mockEngineData([
			engineDocument({
				uuid: 'coupon-once',
				remoteId: '3',
				payload: couponPayload('once', false, {
					usage_limit_per_user: 1,
					used_by: [GUEST_EMAIL, '7'],
				}),
			}),
		]);
		// No applied coupons: the base fixture's individual-use coupon would reject
		// first and mask the per-user check under test.
		orderSnapshot = { ...baseOrderSnapshot, coupon_lines: [] };
	});

	const stubSuccessfulApply = () => {
		const couponLines = [{ code: 'once', discount: '1.8', discount_tax: '0', meta_data: [] }];
		recalculate.mockResolvedValue({ couponLines, lineItems: orderSnapshot.line_items });
		localPatch.mockResolvedValue({ uuid: 'order-uuid' });
		return couponLines;
	};

	it('rejects a guest order whose billing email has already used the coupon', async () => {
		orderSnapshot = { ...orderSnapshot, customer_id: 0, billing: { email: GUEST_EMAIL } };
		const { result } = renderHook(() => useAddCoupon());

		await expect(result.current.addCoupon('once')).resolves.toEqual({
			success: false,
			error: 'Coupon usage limit has been reached for this customer.',
		});
		expect(recalculate).not.toHaveBeenCalled();
		expect(localPatch).not.toHaveBeenCalled();
	});

	it('applies the coupon to a guest order with a different billing email', async () => {
		orderSnapshot = {
			...orderSnapshot,
			customer_id: 0,
			billing: { email: 'someone-else@example.com' },
		};
		const couponLines = stubSuccessfulApply();
		const { result } = renderHook(() => useAddCoupon());

		await expect(result.current.addCoupon('once')).resolves.toEqual({ success: true });
		expect(localPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ coupon_lines: couponLines }),
			})
		);
	});

	it('rejects a logged-in customer whose ID has already used the coupon', async () => {
		orderSnapshot = {
			...orderSnapshot,
			customer_id: 7,
			billing: { email: 'someone-else@example.com' },
		};
		const { result } = renderHook(() => useAddCoupon());

		await expect(result.current.addCoupon('once')).resolves.toEqual({
			success: false,
			error: 'Coupon usage limit has been reached for this customer.',
		});
		expect(recalculate).not.toHaveBeenCalled();
		expect(localPatch).not.toHaveBeenCalled();
	});

	it('applies the coupon to a logged-in customer whose email — but not ID — is in used_by', async () => {
		// WooCommerce identifies an account holder by ID only, so guest usage
		// recorded against this email must not count against them.
		orderSnapshot = { ...orderSnapshot, customer_id: 8, billing: { email: GUEST_EMAIL } };
		stubSuccessfulApply();
		const { result } = renderHook(() => useAddCoupon());

		await expect(result.current.addCoupon('once')).resolves.toEqual({ success: true });
	});
});
