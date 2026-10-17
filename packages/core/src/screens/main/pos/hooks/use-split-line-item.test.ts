/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { wooMetaCarrier } from '@wcpos/sync-core';

import { expectSettledWrites } from '../../../../../jest/cart-write';
import { enqueueOrderMutation, resetOrderMutationQueues } from './order-mutation-queue';
import { useUpdateCartLine } from './use-update-cart-line';
import { useSplitLineItem } from './use-split-line-item';
import {
	getActionHooks,
	registerActionHook,
	resetActionRegistry,
} from '../../../../extensions/actions';

import type { CurrentOrderRecord } from '../contexts/current-order';

// Mock uuid ESM module
jest.mock('uuid', () => ({
	v4: jest.fn(() => `split-uuid-${++mockUuidCount}`),
}));

// Logger mocks are provided by moduleNameMapper in jest.config.js

// Mock the localPatch function
const mockLocalPatch = jest.fn();
const mockReadCatalog = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerSuccess = jest.fn();
let mockUuidCount = 0;
let mockLineItemQuantity = 1;
let mockReducedStock: unknown;

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
	ERROR_CODES: { UNEXPECTED_ERROR: 'UNEXPECTED_ERROR' },
}));

jest.mock('./use-action-context', () => ({
	useActionContext: () => ({
		ctx: {
			log: (_level: string, message: string, options: unknown) => mockLoggerWarn(message, options),
			t: (key: string) => key,
			now: Date.now,
			read: { catalog: mockReadCatalog, paymentMethod: () => null },
			register: { resolveSession: async () => ({ registerId: null, sessionId: null }) },
			store: { preventOverselling: true, priceDecimals: 2 },
		},
		actor: { userId: 7, registerId: 'till', sessionId: null },
	}),
}));

// Lets a test simulate the cashier switching order tabs between event-time record reads.
// Named `mock*` so jest allows the factory below to close over it.
let mockSwitchedOrder: { uuid: string; getLatest: () => unknown } | null = null;
let mockGetCurrentOrderCalls = 0;

// Mock useCurrentOrder / useCurrentOrderActions.
// The hook resolves the record at event time rather than
// subscribing during render, so the mock exposes both against the same fixture.
jest.mock('../contexts/current-order', () => ({
	useCurrentOrderActions: () => ({
		getCurrentOrderRecord: () => {
			// The FIRST read is the capture at press time and must see the real order. Any
			// later read models the cashier having switched tabs in the meantime — which the
			// hook must not consume.
			mockGetCurrentOrderCalls += 1;
			if (mockSwitchedOrder && mockGetCurrentOrderCalls > 1) {
				return mockSwitchedOrder;
			}
			return jest.requireMock('../contexts/current-order').useCurrentOrder().currentOrderRecord;
		},
		setCurrentOrderID: jest.fn(),
	}),
	useCurrentOrder: () => ({
		currentOrderRecord: {
			uuid: 'order-uuid',
			getLatest: () => {
				const lineItems = [
					{
						meta_data: [
							{
								key: '_woocommerce_pos_uuid',
								value: '5aa605ce-325e-47c8-96a9-fef1c55ea5b7',
							},
						],
					},
					{
						id: 42,
						name: 'Item 1',
						product_id: 1,
						variation_id: 0,
						quantity: mockLineItemQuantity,
						price: 10,
						subtotal: '10',
						total: '10',
						meta_data: [
							{
								key: '_woocommerce_pos_uuid',
								value: '23e108ca-63a7-469a-ad12-ed72e0d04be3',
							},
							{
								key: '_woocommerce_pos_data',
								value: JSON.stringify({
									price: 10,
									regular_price: 10,
									tax_status: 'taxable',
								}),
							},
							...(mockReducedStock === undefined
								? []
								: [{ key: '_reduced_stock', value: mockReducedStock }]),
						],
					},
					{
						meta_data: [
							{
								key: '_woocommerce_pos_uuid',
								value: 'f5e3c8d3-7d6d-4a3b-8c1d-0c2a0d1b3c8d',
							},
						],
					},
				];
				return {
					getLatest() {
						return this;
					},
					uuid: 'order-uuid',
					payload: { id: 17, line_items: lineItems },
					toMutableJSON: () => ({ payload: { line_items: lineItems } }),
				};
			},
		},
	}),
}));

// Mock useLocalMutation
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	documentRecordId: () => 'order-uuid',
	useLocalMutation: () => ({
		localPatch: jest
			.requireActual('../../../../../jest/cart-write')
			.resolveCartWrite(mockLocalPatch),
	}),
}));

// Only the store settings are stubbed; the changes-merge and the tax maths run for real
// against a single 10% rate, so this suite fails if the engine port stops behaving like
// the hook it replaced.
jest.mock('./use-cart-config', () => {
	const { createCartConfig } = jest.requireActual('@wcpos/order-math');
	const config = createCartConfig({
		rates: [{ id: 1, rate: '10.0000', compound: false, order: 1, class: 'standard' }],
		allRates: [],
		calcTaxes: true,
		pricesIncludeTax: false,
		taxRoundAtSubtotal: false,
		dp: 2,
		shippingTaxClass: '',
		taxClassSlugs: ['standard', 'reduced-rate', 'zero-rate'],
		calcDiscountsSequentially: false,
	});
	return { useCartConfig: () => config, useCartConfigReader: () => () => config };
});

const stockHooks = (['cart.line.add', 'cart.line.update', 'cart.line.split'] as const).map(
	(event) => [event, getActionHooks(event)] as const
);

describe('useSplitLineItem', () => {
	beforeEach(() => {
		resetOrderMutationQueues();
		resetActionRegistry();
		mockUuidCount = 0;
		for (const [event, hooks] of stockHooks) {
			for (const { hook, ...registration } of hooks) registerActionHook(event, hook, registration);
		}
		jest.clearAllMocks();
		mockSwitchedOrder = null;
		mockGetCurrentOrderCalls = 0;
		mockLocalPatch.mockResolvedValue({ changes: {} });
		mockLineItemQuantity = 1;
		mockReducedStock = undefined;
		mockReadCatalog.mockResolvedValue({
			manage_stock: true,
			stock_quantity: 10,
			backorders: 'no',
			name: 'Item 1',
		});
	});

	afterEach(() => resetActionRegistry());

	it('splits the latest line items after an earlier queued mutation completes', async () => {
		mockLineItemQuantity = 2;
		let resolveFirstPatch: (() => void) | undefined;
		mockLocalPatch.mockImplementationOnce(
			({ data }: { data: { line_items: { quantity?: number }[] } }) =>
				new Promise((resolve) => {
					resolveFirstPatch = () => {
						mockLineItemQuantity = data.line_items[1]?.quantity ?? mockLineItemQuantity;
						resolve({ changes: data });
					};
				})
		);
		const { result } = renderHook(() => ({ ...useUpdateCartLine(), ...useSplitLineItem() }));
		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';

		await act(async () => {
			const firstMutation = result.current.updateCartLine(
				'line_items',
				uuid,
				{ quantity: 3 },
				{ skipStockGuard: true }
			);
			await Promise.resolve();
			const split = result.current.splitLineItem(uuid);

			resolveFirstPatch?.();
			await Promise.all([firstMutation, split]);
		});

		const splitLineItems = mockLocalPatch.mock.calls[1][0].data.line_items as {
			quantity?: number;
		}[];
		expect(splitLineItems.map((lineItem) => lineItem.quantity)).toEqual([
			undefined,
			1,
			1,
			1,
			undefined,
		]);
	});

	it.each([
		{ quantity: 3, reduced: '2', expected: ['1', '1', undefined] },
		{ quantity: 3, reduced: '3', expected: ['1', '1', '1'] },
		{ quantity: 2, reduced: '5', expected: ['1', '4'] },
		{ quantity: 2, reduced: 5, expected: [1, 4] },
		{ quantity: 2.5, reduced: '2', expected: ['1', '1', undefined] },
		{ quantity: 2, reduced: '-2', expected: [undefined, undefined] },
		{ quantity: 2, reduced: 'abc', expected: [undefined, undefined] },
		{ quantity: 3, reduced: undefined, expected: [undefined, undefined, undefined] },
	])(
		'splits a line of $quantity sharing _reduced_stock $reduced as $expected',
		async ({ quantity, reduced, expected }) => {
			mockLineItemQuantity = quantity;
			mockReducedStock = reduced;
			const { result } = renderHook(() => useSplitLineItem());

			await act(async () => {
				await result.current.splitLineItem('23e108ca-63a7-469a-ad12-ed72e0d04be3');
			});

			const lines = (
				mockLocalPatch.mock.calls[0][0].data.line_items as {
					quantity?: number;
					meta_data?: { key?: string; value?: unknown }[];
				}[]
			).slice(1, -1);
			expect(lines.map((line) => line.quantity)).toEqual(
				quantity === 2.5 ? [1, 1, 0.5] : expected.map(() => 1)
			);
			expect(
				lines.map((line) => line.meta_data?.filter((meta) => meta.key === '_reduced_stock'))
			).toEqual(
				expected.map((value) => (value === undefined ? [] : [{ key: '_reduced_stock', value }]))
			);
		}
	);

	it('a vanished line is reported, not split', async () => {
		const seen = jest.fn();
		registerActionHook(
			'cart.line.split',
			async (_, e, next) => {
				seen(e);
				return next(e);
			},
			{ id: 'test.observe', tier: 'extension' }
		);
		const { result } = renderHook(() => useSplitLineItem());
		await act(async () => {
			await result.current.splitLineItem('missing');
		});
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			'Split targeted a line that is no longer in the cart',
			{
				showToast: true,
				toast: { title: 'pos_cart.remove_line_not_found' },
				context: { uuid: 'missing', orderId: 17 },
			}
		);
		expect(mockLoggerError).not.toHaveBeenCalled();
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(seen).not.toHaveBeenCalled();
	});

	it('a quantity of 1 is a no-op', async () => {
		const seen = jest.fn();
		registerActionHook(
			'cart.line.split',
			async (_, e, next) => {
				seen(e);
				return next(e);
			},
			{ id: 'test.observe', tier: 'extension' }
		);
		const { result } = renderHook(() => useSplitLineItem());
		await act(async () => {
			await result.current.splitLineItem('23e108ca-63a7-469a-ad12-ed72e0d04be3');
		});
		expect(mockLoggerError).not.toHaveBeenCalled();
		expect(mockLoggerWarn).not.toHaveBeenCalled();
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(seen).not.toHaveBeenCalled();
	});

	it('dispatches cart.line.split with the exploded lines', async () => {
		mockLineItemQuantity = 3;
		const seen = jest.fn();
		registerActionHook(
			'cart.line.split',
			async (_, e, next) => {
				seen(e);
				return next(e);
			},
			{ id: 'test.observe', tier: 'extension' }
		);
		const { result } = renderHook(() => useSplitLineItem());
		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';
		await act(async () => {
			await result.current.splitLineItem(uuid);
		});
		expect(seen).toHaveBeenCalledTimes(1);
		const event = seen.mock.calls[0][0];
		expect(event).toMatchObject({
			event: 'cart.line.split',
			source: 'user',
			orderId: 'order-uuid',
			actor: { userId: 7, registerId: 'till', sessionId: null },
			payload: { lineUuid: uuid, line: { id: 42, quantity: 3 } },
		});
		const { lines, lineItems } = event.payload;
		expect(lines).toHaveLength(3);
		expect(lines.map((line: { quantity: number }) => line.quantity)).toEqual([1, 1, 1]);
		expect(lines[0].id).toBe(42);
		expect(wooMetaCarrier.lineUuid(lines[0])).toBe(uuid);
		expect(lines[1]).not.toHaveProperty('id');
		expect(lines[2]).not.toHaveProperty('id');
		expect(new Set(lines.map(wooMetaCarrier.lineUuid)).size).toBe(3);
		expect(lineItems).toEqual(
			jest.requireMock('../contexts/current-order').useCurrentOrder().currentOrderRecord.getLatest()
				.payload.line_items
		);
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch.mock.calls[0][0].data.line_items).toEqual([
			lineItems[0],
			...lines,
			lineItems[2],
		]);
	});

	it.each([false, true])(
		'a hook refusal writes nothing (already presented: %s)',
		async (presented) => {
			mockLineItemQuantity = 3;
			registerActionHook(
				'cart.line.split',
				async () => ({ deny: { reasonKey: 'test.no_split', presented } }),
				{ id: 'test.refuse', tier: 'guard' }
			);
			const { result } = renderHook(() => useSplitLineItem());
			await act(async () => {
				expect(await result.current.splitLineItem('23e108ca-63a7-469a-ad12-ed72e0d04be3')).toBe(
					false
				);
			});
			expect(mockLocalPatch).not.toHaveBeenCalled();
			expect(mockLoggerWarn).toHaveBeenCalledTimes(presented ? 0 : 1);
			if (!presented)
				expect(mockLoggerWarn).toHaveBeenCalledWith(
					'test.no_split',
					expect.objectContaining({
						showToast: true,
						context: expect.objectContaining({ reasonKey: 'test.no_split' }),
					})
				);
		}
	);

	it('lands on the saved record a queued add left', async () => {
		mockLineItemQuantity = 3;
		const uuid = '23e108ca-63a7-469a-ad12-ed72e0d04be3';
		const fixture = jest
			.requireMock('../contexts/current-order')
			.useCurrentOrder()
			.currentOrderRecord.getLatest();
		const saved = {
			...fixture,
			payload: { ...fixture.payload, id: 18 },
			getLatest: () => saved,
		} as CurrentOrderRecord;
		mockLineItemQuantity = 1;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const birth = enqueueOrderMutation('order-uuid', async (queue) => {
			await gate;
			queue.order = saved;
		});
		const { result } = renderHook(() => useSplitLineItem());
		await act(async () => {
			const split = result.current.splitLineItem(uuid);
			release();
			await Promise.all([birth, split]);
		});
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch.mock.calls[0][0].document).toBe(saved);
		expect(
			mockLocalPatch.mock.calls[0][0].data.line_items.map(
				(line: { quantity?: number }) => line.quantity
			)
		).toEqual([undefined, 1, 1, 1, undefined]);
	});

	it('does not consult the stock guard even when stock is zero', async () => {
		mockLineItemQuantity = 3;
		mockReadCatalog.mockResolvedValue({ manage_stock: true, stock_quantity: 0, backorders: 'no' });
		expect(
			getActionHooks('cart.line.split').filter(({ id }) => id.startsWith('stock.guard.'))
		).toEqual([]);
		const { result } = renderHook(() => useSplitLineItem());
		await act(async () => {
			await result.current.splitLineItem('23e108ca-63a7-469a-ad12-ed72e0d04be3');
		});
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(mockReadCatalog).not.toHaveBeenCalled();
	});
});

afterEach(() => expectSettledWrites(mockLocalPatch));
