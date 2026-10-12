/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import {
	type ActionEventInput,
	registerActionHook,
	resetActionRegistry,
} from '../../../../extensions/actions';
import { useRemoveLineItem } from './use-remove-line-item';

const mockLocalPatch = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerSuccess = jest.fn();

let mockLines: object[] = [];
const mockOrder = {
	uuid: 'order-uuid',
	payload: { id: 17 },
	getLatest: () => ({ uuid: 'order-uuid', payload: { id: 17, line_items: mockLines } }),
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

describe('useRemoveLineItem', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		resetActionRegistry();
		mockLocalPatch.mockResolvedValue(true);
		mockLines = [];
	});
	const coffee = {
		id: 11,
		name: 'Coffee',
		product_id: 82,
		meta_data: [{ key: '_woocommerce_pos_uuid', value: 'line-1' }],
	};

	it('dispatches cart.line.remove with the leaving line, then writes', async () => {
		mockLines = [coffee];
		const seen: ActionEventInput<'cart.line.remove'>[] = [];
		registerActionHook(
			'cart.line.remove',
			async (_ctx, e, next) => {
				seen.push(e);
				expect(mockLocalPatch).not.toHaveBeenCalled();
				return next(e);
			},
			{ id: 'test.observer', tier: 'extension' }
		);
		const { result } = renderHook(() => useRemoveLineItem());
		await act(async () => result.current.removeLineItem('line-1', 'line_items'));
		expect(seen).toEqual([
			expect.objectContaining({
				event: 'cart.line.remove',
				orderId: 'order-uuid',
				source: 'user',
				actor: { userId: 7, registerId: 'till', sessionId: null },
				payload: { type: 'line_items', lineUuid: 'line-1', line: coffee, lineItems: [coffee] },
			}),
		]);
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
	});

	it('a guard refusal leaves the line in the cart and presents the reason', async () => {
		mockLines = [coffee];
		registerActionHook(
			'cart.line.remove',
			async () => ({ deny: { reasonKey: 'test.no_removals' } }),
			{ id: 'test.guard', tier: 'guard' }
		);
		const { result } = renderHook(() => useRemoveLineItem());
		await act(async () => result.current.removeLineItem('line-1', 'line_items'));
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockLoggerSuccess).not.toHaveBeenCalled();
		expect(mockActionLog).toHaveBeenCalledWith(
			'warn',
			'test.no_removals',
			expect.objectContaining({ showToast: true })
		);
	});

	it('Undo re-enters through cart.line.add, so a guard can refuse the restore', async () => {
		mockLines = [coffee];
		const adds: ActionEventInput<'cart.line.add'>[] = [];
		registerActionHook(
			'cart.line.add',
			async (_ctx, e, next) => {
				adds.push(e);
				return e.payload.line.name === 'Coffee'
					? { deny: { reasonKey: 'pos_products.out_of_stock', params: { name: 'Coffee' } } }
					: next(e);
			},
			{ id: 'test.stock', tier: 'guard' }
		);
		const { result } = renderHook(() => useRemoveLineItem());
		await act(async () => result.current.removeLineItem('line-1', 'line_items'));
		mockLines = [];
		await act(async () => mockLoggerSuccess.mock.calls[0][1].toast.action.onClick());
		expect(adds).toEqual([
			expect.objectContaining({
				event: 'cart.line.add',
				payload: expect.objectContaining({
					type: 'line_items',
					line: expect.objectContaining({ name: 'Coffee' }),
				}),
			}),
		]);
		// The remove wrote once; the refused restore did not.
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(mockActionLog).toHaveBeenCalledWith(
			'warn',
			'pos_products.out_of_stock',
			expect.objectContaining({ showToast: true })
		);
	});

	it('patches a matching line and logs success with an undo action', async () => {
		mockLines = [
			{
				id: 11,
				name: 'Coffee',
				product_id: 82,
				meta_data: [{ key: '_woocommerce_pos_uuid', value: 'line-1' }],
			},
		];
		const { result } = renderHook(() => useRemoveLineItem());

		await act(async () => {
			await result.current.removeLineItem('line-1', 'line_items');
		});

		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: expect.objectContaining({ payload: expect.objectContaining({ id: 17 }) }),
			data: {
				line_items: [expect.objectContaining({ id: 11, product_id: null })],
			},
		});
		expect(mockLoggerSuccess).toHaveBeenCalledWith(
			'pos.removed_from_cart',
			expect.objectContaining({
				toast: expect.objectContaining({
					action: expect.objectContaining({ label: 'common.undo', onClick: expect.any(Function) }),
				}),
			})
		);
		expect(mockLoggerWarn).not.toHaveBeenCalled();
	});

	it.each([true, false])(
		'Undo after deletion confirmed=%s restores only valid identity',
		async (confirmed) => {
			const original = {
				id: 11,
				product_id: 82,
				name: 'Coffee',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: 'line-1' }],
			};
			mockLines = [original];
			const { result } = renderHook(() => useRemoveLineItem());
			await act(async () => result.current.removeLineItem('line-1', 'line_items'));
			mockLines = confirmed ? [] : [{ ...original, product_id: null }];
			await act(async () => mockLoggerSuccess.mock.calls[0][1].toast.action.onClick());
			const restored = mockLocalPatch.mock.calls.at(-1)[0].data.line_items;
			const { id, ...content } = original;
			expect(restored).toEqual([confirmed ? content : original]);
			expect(original.id).toBe(id);
		}
	);

	it('warns when the line is no longer in the current order', async () => {
		const { result } = renderHook(() => useRemoveLineItem());

		await act(async () => {
			await result.current.removeLineItem('missing', 'line_items');
		});

		expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			'Remove tapped for a line that is no longer in the cart',
			{
				showToast: true,
				toast: { title: 'pos_cart.remove_line_not_found' },
				context: { uuid: 'missing', itemType: 'line_items', orderId: 17 },
			}
		);
	});
});
