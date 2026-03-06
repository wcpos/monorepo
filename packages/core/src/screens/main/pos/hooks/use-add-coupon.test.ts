/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { useAddCoupon } from './use-add-coupon';

const mockAddItemToOrder = jest.fn();
const mockCouponFindOne = jest.fn();

jest.mock('observable-hooks', () => ({
	useObservableEagerState: jest.fn(() => 'no'),
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: jest.fn(() => {
		const logger = {
			with: jest.fn(),
			info: jest.fn(),
			error: jest.fn(),
		};
		logger.with.mockReturnValue(logger);
		return logger;
	}),
}));

jest.mock('./use-add-item-to-order', () => ({
	useAddItemToOrder: () => ({
		addItemToOrder: mockAddItemToOrder,
	}),
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		store: {
			woocommerce_calc_discounts_sequentially$: {},
			calc_discounts_sequentially$: {},
		},
	}),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../../hooks/use-collection', () => ({
	useCollection: (name: string) => {
		if (name === 'coupons') {
			return {
				collection: {
					findOne: mockCouponFindOne,
				},
			};
		}

		return {
			collection: {
				find: jest.fn(() => ({ exec: jest.fn().mockResolvedValue([]) })),
			},
		};
	},
}));

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrder: {
			uuid: 'order-uuid',
			id: 42,
			number: '1001',
			getLatest: () => ({
				line_items: [],
				coupon_lines: [],
				billing: {},
				customer_id: null,
			}),
		},
	}),
}));

const logger = (getLogger as unknown as jest.Mock).mock.results[0].value as {
	with: jest.Mock;
	info: jest.Mock;
	error: jest.Mock;
};

describe('useAddCoupon', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCouponFindOne.mockReturnValue({
			exec: jest.fn().mockResolvedValue({
				toJSON: () => ({
					code: 'save10',
					discount_type: 'fixed_cart',
					amount: '10',
					product_ids: [],
					excluded_product_ids: [],
					product_categories: [],
					excluded_product_categories: [],
					exclude_sale_items: false,
				}),
			}),
		});
	});

	it('returns a degraded-state failure without logging coupon success', async () => {
		mockAddItemToOrder.mockRejectedValue(
			Object.assign(new Error('storage unavailable'), { code: 'DB01005' })
		);

		const { result } = renderHook(() => useAddCoupon());
		const response = await result.current.addCoupon('SAVE10');

		expect(response).toEqual({
			success: false,
			error: 'common.pos_storage_connection_lost',
		});
		expect(logger.info).not.toHaveBeenCalled();
		expect(logger.error).not.toHaveBeenCalled();
	});
});
