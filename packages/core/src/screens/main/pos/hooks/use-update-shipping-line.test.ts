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
import { useUpdateShippingLine } from './use-update-shipping-line';

const mockLocalPatch = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerSuccess = jest.fn();

let mockShippingLines: object[] = [];
const mockOrder = {
	uuid: 'order-uuid',
	payload: { id: 17 },
	getLatest: () => ({
		uuid: 'order-uuid',
		payload: { id: 17 },
		toMutableJSON: () => ({ payload: { shipping_lines: mockShippingLines } }),
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
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: mockOrder }),
}));

const mockActionLog = jest.fn();
jest.mock('./use-action-context', () => ({
	useActionContext: () => ({
		ctx: {
			log: mockActionLog,
			t: (key: string) => key,
			now: Date.now,
			read: { catalog: async () => null },
			register: { resolveSession: async () => ({ registerId: null, sessionId: null }) },
			store: { preventOverselling: false },
		},
		actor: { userId: 7, registerId: 'till', sessionId: null },
	}),
}));

// Only the store settings are stubbed; the tax maths and the changes-merge run for
// real, so this suite fails if the engine port stops behaving like the hook it replaced.
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
	return { useCartConfig: () => config };
});

describe('useUpdateShippingLine', () => {
	beforeEach(() => {
		resetOrderMutationQueues();
		jest.clearAllMocks();
		resetActionRegistry();
		mockShippingLines = [];
		mockLocalPatch.mockResolvedValue(true);
	});

	it('dispatches cart.line.update typed shipping_lines, and a rewritten change reaches the write', async () => {
		mockShippingLines = [
			{
				method_title: 'Flat rate',
				method_id: 'flat_rate',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: 'ship-1' }],
			},
		];
		const seen: ActionEventInput<'cart.line.update'>[] = [];
		registerActionHook(
			'cart.line.update',
			async (_ctx, e, next) => {
				seen.push(e);
				return next({
					...e,
					payload: { ...e.payload, changes: { ...e.payload.changes, amount: 5 } },
				});
			},
			{ id: 'test.rewriter', tier: 'extension' }
		);
		const { result } = renderHook(() => useUpdateShippingLine());
		await act(async () => result.current.updateShippingLine('ship-1', { amount: 3 }));
		expect(seen).toEqual([
			expect.objectContaining({
				event: 'cart.line.update',
				orderId: 'order-uuid',
				payload: expect.objectContaining({
					type: 'shipping_lines',
					lineUuid: 'ship-1',
					changes: { amount: 3 },
					line: expect.objectContaining({ method_title: 'Flat rate' }),
					lineItems: [],
				}),
			}),
		]);
		expect(mockLocalPatch).toHaveBeenCalledWith(
			expect.objectContaining({
				data: { shipping_lines: [expect.objectContaining({ total: '5' })] },
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
					shipping_lines: [
						{
							method_title: 'Flat rate',
							method_id: 'flat_rate',
							meta_data: [{ key: '_woocommerce_pos_uuid', value: 'ship-1' }],
						},
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
		const { result } = renderHook(() => useUpdateShippingLine());
		const pending = act(async () => result.current.updateShippingLine('ship-1', { amount: 3 }));
		release();
		await pending;
		expect(mockLocalPatch).toHaveBeenCalledWith(expect.objectContaining({ document: saved }));
	});

	it('a guard refusal writes nothing and presents the reason', async () => {
		mockShippingLines = [
			{
				method_title: 'Flat rate',
				method_id: 'flat_rate',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: 'ship-1' }],
			},
		];
		registerActionHook('cart.line.update', async () => ({ deny: { reasonKey: 'test.locked' } }), {
			id: 'test.guard',
			tier: 'guard',
		});
		const { result } = renderHook(() => useUpdateShippingLine());
		await act(async () => result.current.updateShippingLine('ship-1', { amount: 3 }));
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockActionLog).toHaveBeenCalledWith(
			'warn',
			'test.locked',
			expect.objectContaining({ showToast: true })
		);
	});

	it('patches a recalculated matching shipping line', async () => {
		mockShippingLines = [
			{
				method_title: 'Delivery',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: 'shipping-1' }],
			},
		];
		const { result } = renderHook(() => useUpdateShippingLine());

		await act(async () => {
			await result.current.updateShippingLine('shipping-1', { amount: 3 });
		});

		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: expect.objectContaining({ payload: expect.objectContaining({ id: 17 }) }),
			data: {
				shipping_lines: [expect.objectContaining({ total: '3', total_tax: '0' })],
			},
		});
		// The changes-merge is the engine's now: `amount` has to land in pos_data, not
		// top-level, or the next recalculation reads the pre-edit amount back.
		const [{ data }] = mockLocalPatch.mock.calls[0];
		const posData = data.shipping_lines[0].meta_data.find(
			(meta: { key: string }) => meta.key === '_woocommerce_pos_data'
		);
		expect(posData.value).toEqual(expect.objectContaining({ amount: 3, tax_status: 'taxable' }));
		expect(mockLoggerWarn).not.toHaveBeenCalled();
	});

	it('warns without patching when the shipping line is absent', async () => {
		const { result } = renderHook(() => useUpdateShippingLine());

		await act(async () => {
			await result.current.updateShippingLine('missing', { amount: 3 });
		});

		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			'Shipping line update targeted a line that is no longer in the cart',
			{
				showToast: true,
				toast: { title: 'pos_cart.update_shipping_not_found' },
				context: { uuid: 'missing', orderId: 17 },
			}
		);
	});
});
