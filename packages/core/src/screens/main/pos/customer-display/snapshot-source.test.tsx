/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, renderHook } from '@testing-library/react';

import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { notifyCustomerDisplayServiceStart } from './customer-display-service-start';
import { CustomerDisplaySnapshotSource } from './snapshot-source';
import { useDisplaySnapshot } from './use-display-snapshot';
import { buildReceiptData } from '../../receipt/utils/build-receipt-data';

const mockLoggerError = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		debug: jest.fn(),
		error: (...args: unknown[]) => mockLoggerError(...args),
		info: jest.fn(),
		warn: jest.fn(),
	}),
}));

jest.mock('../../receipt/utils/build-receipt-data', () => {
	const actual = jest.requireActual('../../receipt/utils/build-receipt-data');
	return { ...actual, buildReceiptData: jest.fn(actual.buildReceiptData) };
});

const mockPublish = jest.fn();
let mockDisplayService: { publish: typeof mockPublish } | null = { publish: mockPublish };
jest.mock('../../../../services/customer-display', () => ({
	...jest.requireActual('../../../../services/customer-display'),
	getCustomerDisplayService: () => mockDisplayService,
}));

const line = {
	id: 1,
	product_id: 11 as number | null,
	name: 'Coffee',
	quantity: 1,
	subtotal: '5.00',
	subtotal_tax: '0.00',
	total: '5.00',
	total_tax: '0.00',
	meta_data: [],
};

const basePayload = {
	id: 0,
	number: '',
	status: 'pos-open',
	currency: 'EUR',
	total: '5.00',
	total_tax: '0.00',
	discount_total: '0.00',
	discount_tax: '0.00',
	line_items: [] as (typeof line)[],
	fee_lines: [] as unknown[],
	shipping_lines: [] as unknown[],
	coupon_lines: [] as unknown[],
	tax_lines: [] as unknown[],
	meta_data: [] as unknown[],
	billing: {},
	shipping: {},
	customer_id: 0,
	customer_note: '',
};

let mockOrder = { uuid: 'order-a', payload: basePayload };
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: mockOrder }),
}));

const mockStore = {
	id: 7,
	name: 'Main Street',
	currency: 'EUR',
	locale: 'en_IE',
	timezone: 'Europe/Dublin',
	tax_display_cart: 'incl',
	prices_include_tax: 'yes',
	receipt_i18n: {},
};
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: mockStore }),
}));

jest.mock('@wcpos/query', () => ({
	useDocField: (document: any, select: (value: any) => unknown) => select(document),
	useRecordField: (document: any, select: (value: any) => unknown) => select(document),
}));

jest.mock('../../contexts/tax-rates/provider', () => ({
	useTaxSettingsOptional: () => ({ priceNumDecimals: 2 }),
}));

const mockGetStatusLabel = (status: string) => status;
jest.mock('../../hooks/use-order-status-label', () => ({
	useOrderStatusLabel: () => ({ getLabel: mockGetStatusLabel }),
}));

const mockPaymentMethods = new Map([['cod', { id: 'cod', title: 'Cash' }]]);
jest.mock('../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ byId: mockPaymentMethods }),
}));

const mockT = () => 'Payment declined — please try another payment method.';
jest.mock('../../../../contexts/translations', () => ({
	useT: () => mockT,
}));

const payment = (status: 'pending' | 'captured' | 'failed') => ({
	id: 'payment-1',
	source: 'app' as const,
	order_id: 0,
	method_id: 'cod',
	provider: null,
	kind: 'cash' as const,
	capture_mode: 'manual' as const,
	transport: null,
	recorded_offline: false,
	amount: '5.00',
	currency: 'EUR',
	tendered: null,
	change: null,
	tip: null,
	status,
	failure_reason: status === 'failed' ? 'provider text' : null,
	refunded_amount: '0.00',
	refunds: [],
	provider_refs: {},
	receipt: {},
	cashier_id: 1,
	store_id: 7,
	created_at_gmt: '2026-09-03T10:00:00Z',
	captured_at_gmt: null,
	updated_at_gmt: '2026-09-03T10:00:00Z',
});

const withPayload = (payload: Partial<typeof basePayload>, uuid = mockOrder.uuid) => {
	mockOrder = { uuid, payload: { ...basePayload, ...payload } };
};

const flushMicrotask = async () => {
	await act(async () => Promise.resolve());
};

beforeEach(() => {
	jest.useRealTimers();
	jest.clearAllMocks();
	mockDisplayService = { publish: mockPublish };
	withPayload({}, 'order-a');
});

test('renders local receipt data without passing string money through the printer formatter', () => {
	// Adapted from the realistic order/store fixtures in build-receipt-data.test.ts.
	const numberFormat = jest.spyOn(Intl, 'NumberFormat').mockImplementation(() => {
		throw new RangeError('Intl currency formatting unavailable');
	});
	try {
		withPayload({ line_items: [line] });
		expect(() => render(<CustomerDisplaySnapshotSource />)).not.toThrow();
		expect(mockPublish).toHaveBeenLastCalledWith(
			expect.objectContaining({
				action: 'cart.updated',
				payload: expect.objectContaining({
					order: expect.objectContaining({
						lines: [expect.objectContaining({ unit_price: '5.00' })],
					}),
				}),
			})
		);
	} finally {
		numberFormat.mockRestore();
	}
});

test('publishes idle and logs once when receipt building throws', () => {
	jest.mocked(buildReceiptData).mockImplementationOnce(() => {
		throw new Error('broken receipt');
	});

	const view = render(<CustomerDisplaySnapshotSource />);
	view.rerender(<CustomerDisplaySnapshotSource />);

	expect(mockPublish).toHaveBeenLastCalledWith({
		action: 'display.idle',
		payload: { reason: 'no_cart' },
	});
	expect(mockLoggerError).toHaveBeenCalledTimes(1);
	expect(mockLoggerError).toHaveBeenCalledWith('Customer display snapshot build failed', {
		code: ERROR_CODES.CUSTOMER_DISPLAY_SNAPSHOT_FAILED,
		context: { orderUuid: 'order-a' },
	});
});

test('does not republish an unchanged memoised snapshot on rerender', () => {
	withPayload({ line_items: [line] });
	const view = render(<CustomerDisplaySnapshotSource />);
	mockPublish.mockClear();

	view.rerender(<CustomerDisplaySnapshotSource />);

	expect(mockPublish).not.toHaveBeenCalled();
});

test('publishes the current snapshot when the service finishes starting', () => {
	mockDisplayService = null;
	render(<CustomerDisplaySnapshotSource />);
	expect(mockPublish).not.toHaveBeenCalled();

	mockDisplayService = { publish: mockPublish };
	act(() => notifyCustomerDisplayServiceStart());

	expect(mockPublish).toHaveBeenCalledWith({
		action: 'display.idle',
		payload: { reason: 'no_cart' },
	});
});

test('publishes idle for an empty cart and cart.updated after a line is added', () => {
	const view = render(<CustomerDisplaySnapshotSource />);
	expect(mockPublish).toHaveBeenLastCalledWith({
		action: 'display.idle',
		payload: { reason: 'no_cart' },
	});

	withPayload({ line_items: [line] });
	view.rerender(<CustomerDisplaySnapshotSource />);

	expect(mockPublish).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'cart.updated' }));
	view.unmount();
});

test('treats tombstoned lines and coupons as empty and excludes them from receipt data', () => {
	withPayload({
		line_items: [{ ...line, product_id: null }],
		fee_lines: [{ name: null }],
		shipping_lines: [{ method_id: null }],
		coupon_lines: [{ code: null }],
	});

	const { result } = renderHook(() => useDisplaySnapshot());

	expect(result.current?.isEmpty).toBe(true);
	expect(result.current?.order.lines).toEqual([]);
	expect(result.current?.order.fees).toEqual([]);
	expect(result.current?.order.shipping).toEqual([]);
	expect(result.current?.order.discounts).toEqual([]);
	expect(result.current?.hasCoupons).toBe(false);
});

test('switches directly to the new order snapshot without an idle event', () => {
	withPayload({ line_items: [line] });
	const view = render(<CustomerDisplaySnapshotSource />);
	mockPublish.mockClear();

	withPayload({ line_items: [{ ...line, name: 'Tea' }] }, 'order-b');
	view.rerender(<CustomerDisplaySnapshotSource />);

	expect(mockPublish).toHaveBeenCalledTimes(1);
	expect(mockPublish).toHaveBeenCalledWith(expect.objectContaining({ action: 'cart.updated' }));
	view.unmount();
});

test('publishes idle in a microtask after the source unmounts', async () => {
	withPayload({ line_items: [line] });
	const view = render(<CustomerDisplaySnapshotSource />);
	mockPublish.mockClear();

	view.unmount();
	expect(mockPublish).not.toHaveBeenCalled();
	await flushMicrotask();

	expect(mockPublish).toHaveBeenCalledWith({
		action: 'display.idle',
		payload: { reason: 'no_cart' },
	});
});

test('publishes payment.state when a ledger row changes', () => {
	withPayload({ line_items: [line] });
	const view = render(<CustomerDisplaySnapshotSource />);
	mockPublish.mockClear();

	withPayload({
		line_items: [line],
		meta_data: [{ key: '_wcpos_payments', value: { schema: 1, payments: [payment('pending')] } }],
	});
	view.rerender(<CustomerDisplaySnapshotSource />);

	expect(mockPublish).toHaveBeenCalledWith(
		expect.objectContaining({
			action: 'payment.state',
			payload: expect.objectContaining({
				state: 'started',
				leg: expect.objectContaining({ method: 'Cash' }),
			}),
		})
	);
	view.unmount();
});

test('debounces snapshots while a coupon is active', () => {
	jest.useFakeTimers();
	withPayload({ line_items: [line], coupon_lines: [{ code: 'SAVE' }] });
	const view = render(<CustomerDisplaySnapshotSource />);

	expect(mockPublish).not.toHaveBeenCalled();
	act(() => jest.advanceTimersByTime(50));
	expect(mockPublish).toHaveBeenCalledWith(expect.objectContaining({ action: 'cart.updated' }));
	view.unmount();
});
