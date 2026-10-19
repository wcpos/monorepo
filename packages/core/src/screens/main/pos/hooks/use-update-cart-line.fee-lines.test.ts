/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { resetOrderMutationQueues } from './order-mutation-queue';
import {
	type ActionEventInput,
	registerActionHook,
	resetActionRegistry,
} from '../../../../extensions/actions';
import { useUpdateCartLine } from './use-update-cart-line';

const mockLocalPatch = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerSuccess = jest.fn();

let mockFeeLines: object[] = [];
let mockLineItems: object[] = [];
const mockOrder = {
	uuid: 'order-uuid',
	payload: { id: 17 },
	getLatest: () => ({
		getLatest() {
			return this;
		},
		uuid: 'order-uuid',
		payload: { id: 17, fee_lines: mockFeeLines, line_items: mockLineItems },
		toMutableJSON: () => ({
			payload: { fee_lines: mockFeeLines, line_items: mockLineItems },
		}),
	}),
};

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

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({
		localPatch: jest
			.requireActual('../../../../../jest/cart-write')
			.resolveCartWrite(mockLocalPatch),
	}),
}));

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: mockOrder }),
	useCurrentOrderActions: () => ({ getCurrentOrderRecord: () => mockOrder }),
}));

const mockActionLog = jest.fn();
jest.mock('./use-action-context', () => ({
	useActionContext: () => ({
		ctx: {
			log: mockActionLog,
			t: (key: string) => key,
			now: Date.now,
			read: { catalog: async () => null, paymentMethod: () => null },
			register: { resolveSession: async () => ({ registerId: null, sessionId: null }) },
			store: { preventOverselling: false, priceDecimals: 2 },
		},
		actor: { userId: 7, registerId: 'till', sessionId: null },
	}),
}));

// Only the store settings are stubbed; the tax maths, the changes-merge and the
// percent basis all run for real, so this suite fails if the engine port stops
// behaving like the hook it replaced.
jest.mock('./use-cart-config', () => {
	const { createCartConfig } = jest.requireActual('@wcpos/order-math');
	const config = createCartConfig({
		rates: [],
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

describe('useUpdateCartLine — fee_lines', () => {
	beforeEach(() => {
		resetOrderMutationQueues();
		jest.clearAllMocks();
		resetActionRegistry();
		mockFeeLines = [];
		mockLineItems = [];
		mockLocalPatch.mockResolvedValue(true);
	});

	it('dispatches cart.line.update typed fee_lines, and a rewritten change reaches the write', async () => {
		mockFeeLines = [
			{ name: 'Handling', meta_data: [{ key: '_woocommerce_pos_uuid', value: 'fee-1' }] },
		];
		mockLineItems = [{ product_id: 1, total: '80', total_tax: '8' }];
		const seen: ActionEventInput<'cart.line.update'>[] = [];
		registerActionHook(
			'cart.line.update',
			async (_ctx, e, next) => {
				seen.push(e);
				return next({
					...e,
					payload: { ...e.payload, changes: { ...e.payload.changes, amount: '5' } },
				});
			},
			{ id: 'test.rewriter', tier: 'extension' }
		);
		const { result } = renderHook(() => useUpdateCartLine());
		await act(async () => result.current.updateCartLine('fee_lines', 'fee-1', { amount: '3' }));
		expect(seen).toEqual([
			expect.objectContaining({
				event: 'cart.line.update',
				orderId: 'order-uuid',
				payload: expect.objectContaining({
					type: 'fee_lines',
					lineUuid: 'fee-1',
					changes: { amount: '3' },
					line: expect.objectContaining({ name: 'Handling' }),
					lineItems: mockLineItems,
				}),
			}),
		]);
		expect(mockLocalPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ fee_lines: [expect.objectContaining({ total: '5' })] }),
			})
		);
	});

	it('lands on the saved order a first add left on the slot', async () => {
		const { enqueueOrderMutation } =
			jest.requireActual<typeof import('./order-mutation-queue')>('./order-mutation-queue');
		const saved = {
			uuid: 'order-uuid',
			payload: { id: 18 },
			getLatest: () => saved,
			toMutableJSON: () => ({
				payload: {
					fee_lines: [
						{ name: 'Handling', meta_data: [{ key: '_woocommerce_pos_uuid', value: 'fee-1' }] },
					],
					line_items: [],
				},
			}),
		} as never;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		void enqueueOrderMutation('order-uuid', async (queue) => {
			await gate;
			queue.order = saved;
		});
		const { result } = renderHook(() => useUpdateCartLine());
		const pending = act(async () =>
			result.current.updateCartLine('fee_lines', 'fee-1', { amount: '3' })
		);
		release();
		await pending;
		expect(mockLocalPatch).toHaveBeenCalledWith(expect.objectContaining({ document: saved }));
	});

	it('a guard refusal writes nothing and presents the reason', async () => {
		mockFeeLines = [
			{ name: 'Handling', meta_data: [{ key: '_woocommerce_pos_uuid', value: 'fee-1' }] },
		];
		registerActionHook('cart.line.update', async () => ({ deny: { reasonKey: 'test.locked' } }), {
			id: 'test.guard',
			tier: 'guard',
		});
		const { result } = renderHook(() => useUpdateCartLine());
		await act(async () => result.current.updateCartLine('fee_lines', 'fee-1', { amount: '3' }));
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockActionLog).toHaveBeenCalledWith(
			'warn',
			'test.locked',
			expect.objectContaining({ showToast: true })
		);
	});

	it('patches a recalculated matching fee line', async () => {
		mockFeeLines = [
			{
				name: 'Handling',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: 'fee-1' }],
			},
		];
		const { result } = renderHook(() => useUpdateCartLine());

		await act(async () => {
			await result.current.updateCartLine('fee_lines', 'fee-1', { amount: '3' });
		});

		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: expect.objectContaining({ payload: expect.objectContaining({ id: 17 }) }),
			data: expect.objectContaining({
				fee_lines: [expect.objectContaining({ total: '3', total_tax: '0' })],
			}),
		});
		// The changes-merge is the engine's now: `amount` has to land in pos_data, not
		// top-level, or the next recalculation reads the pre-edit amount back.
		const [{ data }] = mockLocalPatch.mock.calls[0];
		const posData = data.fee_lines[0].meta_data.find(
			(meta: { key: string }) => meta.key === '_woocommerce_pos_data'
		);
		expect(posData.value).toEqual(expect.objectContaining({ amount: '3', percent: false }));
		expect(mockLoggerWarn).not.toHaveBeenCalled();
	});

	it('computes a percentage fee from the SAME snapshot it patches', async () => {
		// The retired hook re-read the order with getLatest() in the middle of its own
		// arithmetic, so the basis could come from a newer cart than the one being written.
		// The basis is an explicit input now, taken from this snapshot's line items.
		mockLineItems = [
			{ product_id: 1, total: '80', total_tax: '8' },
			// Tombstoned: excluded from the basis, exactly as `product_id !== null` did.
			{ product_id: null, total: '999', total_tax: '99' },
		];
		mockFeeLines = [
			{
				name: '10% service charge',
				meta_data: [
					{ key: '_woocommerce_pos_uuid', value: 'fee-1' },
					{
						key: '_woocommerce_pos_data',
						value: { amount: '10', percent: true, percent_of_cart_total_with_tax: false },
					},
				],
			},
		];
		const { result } = renderHook(() => useUpdateCartLine());

		await act(async () => {
			await result.current.updateCartLine('fee_lines', 'fee-1', {
				percent_of_cart_total_with_tax: true,
			});
		});

		// 10% of (80 + 8), the tombstoned line contributing nothing.
		const [{ data }] = mockLocalPatch.mock.calls[0];
		expect(data.fee_lines[0].total).toBe('8.8');
	});

	it('warns without patching when the fee line is absent', async () => {
		const { result } = renderHook(() => useUpdateCartLine());

		await act(async () => {
			await result.current.updateCartLine('fee_lines', 'missing', { amount: '3' });
		});

		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			'Fee line update targeted a line that is no longer in the cart',
			{
				showToast: true,
				toast: { title: 'pos_cart.update_fee_not_found' },
				context: { uuid: 'missing', orderId: 17 },
			}
		);
	});
});

jest.mock('../commands/use-boundary-commit', () => ({
	useBoundaryCommit: () => jest.fn(),
}));
