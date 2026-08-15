/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react';

import { EditCouponScreen } from './coupons/edit';
import { EditCustomerScreen } from './customers/edit';
import { EditOrderScreen } from './orders/edit';
import { RefundOrderScreen } from './orders/refund';
import { ViewOrderScreen } from './orders/view';
import { CheckoutScreen } from './pos/checkout';
import { EditProductScreen } from './products/edit/product';
import { EditVariationScreen } from './products/edit/variation';
import { ReceiptScreen } from './receipt';

const mockResource = { marker: 'engine-resource' };
const mockUseEngineDocument = jest.fn((_collection: unknown, _uuid: unknown) => mockResource);
let mockRouteParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
	useLocalSearchParams: () => mockRouteParams,
}));

jest.mock('./hooks/use-engine-document', () => ({
	useEngineDocument: (collection: unknown, uuid: unknown) =>
		mockUseEngineDocument(collection, uuid),
}));

jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('./coupons/edit/edit-coupon', () => ({ EditCoupon: () => null }));
jest.mock('./customers/edit/edit-customer', () => ({ EditCustomer: () => null }));
jest.mock('./orders/edit/modal', () => ({ EditOrderModal: () => null }));
jest.mock('./orders/refund/modal', () => ({ RefundOrderModal: () => null }));
jest.mock('./orders/view/modal', () => ({ ViewOrderModal: () => null }));
jest.mock('./pos/checkout/checkout', () => ({ Checkout: () => null }));
jest.mock('./products/edit/product/modal', () => ({ EditProductModal: () => null }));
jest.mock('./products/edit/variation/modal', () => ({ EditVariationModal: () => null }));
jest.mock('./receipt/receipt', () => ({ Receipt: () => null }));

describe('engine modal/detail reads', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it.each([
		['coupon', EditCouponScreen, 'couponId', 'coupon-uuid', 'coupons'],
		['customer', EditCustomerScreen, 'customerId', 'customer-uuid', 'customers'],
		['order edit', EditOrderScreen, 'orderId', 'edit-order-uuid', 'orders'],
		['order refund', RefundOrderScreen, 'orderId', 'refund-order-uuid', 'orders'],
		['order view', ViewOrderScreen, 'orderId', 'view-order-uuid', 'orders'],
		['checkout', CheckoutScreen, 'orderId', 'checkout-order-uuid', 'orders'],
		['product', EditProductScreen, 'productId', 'product-uuid', 'products'],
		['variation', EditVariationScreen, 'variationId', 'variation-uuid', 'variations'],
		['receipt', ReceiptScreen, 'orderId', 'receipt-order-uuid', 'orders'],
	] as const)(
		'binds the %s route UUID through the engine hook',
		(_name, Screen, param, uuid, collection) => {
			mockRouteParams = { [param]: uuid };

			render(<Screen />);

			expect(mockUseEngineDocument).toHaveBeenCalledWith(collection, uuid);
		}
	);
});
