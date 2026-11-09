/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { expectSettledWrites } from '../../../../../jest/cart-write';
import { useCartCommand } from './use-cart-command';
import { enqueueOrderMutation, resetOrderMutationQueues } from '../hooks/order-mutation-queue';
import {
	type ActionEventInput,
	createActionContext,
	isActionRefusal,
	registerActionHook,
	resetActionRegistry,
} from '../../../../extensions/actions';

import type { CartCommandSlot } from './cart-command';
import type { CurrentOrderRecord } from '../contexts/current-order';

const mockPatch = jest.fn();
const mockLog = jest.fn();
const actor = { userId: 7, registerId: 'till', sessionId: null };
function order(uuid: string): CurrentOrderRecord {
	const value = {
		uuid,
		payload: { id: 17, status: 'pos-open', line_items: [] },
		getLatest: () => value,
	};
	return value as unknown as CurrentOrderRecord;
}
const shown = order('shown');
const selected = order('selected');
let mockCurrent: CurrentOrderRecord = shown;

jest.mock('../contexts/current-order', () => ({
	useCurrentOrderActions: () => ({ getCurrentOrderRecord: () => mockCurrent }),
}));
jest.mock('../hooks/use-action-context', () => ({
	useActionContext: () => ({
		ctx: createActionContext({
			log: mockLog,
			t: (key) => key,
			readCatalog: async () => null,
			readPaymentMethod: () => null,
			preventOverselling: false,
			priceDecimals: 2,
			resolveSession: async () => ({ registerId: null, sessionId: null }),
		}),
		actor: { userId: 7, registerId: 'till', sessionId: null },
	}),
}));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({
		localPatch: jest.requireActual('../../../../../jest/cart-write').resolveCartWrite(mockPatch),
	}),
}));
jest.mock('../hooks/use-cart-config', () => jest.requireActual('../../../../../jest/cart-write'));
jest.mock('./use-boundary-commit', () => ({ useBoundaryCommit: () => jest.fn() }));

const lines = [{ product_id: 1, quantity: 1, total: '10', subtotal: '10' }];
const payload = { lineUuid: 'line', line: {}, lines: [], lineItems: [] };
type Slot = CartCommandSlot<'cart.line.split'>;
const split = ({ dispatch }: Slot) =>
	dispatch(payload, (_e, write) => write({ line_items: lines }));

beforeEach(() => {
	resetOrderMutationQueues();
	resetActionRegistry();
	jest.clearAllMocks();
	mockCurrent = shown;
	mockPatch.mockImplementation(async ({ document }) => document);
});
afterEach(() => expectSettledWrites(mockPatch));

it('reads the target when pressed, not when rendered, and dispatches the standard input', async () => {
	const seen: ActionEventInput<'cart.line.split'>[] = [];
	registerActionHook(
		'cart.line.split',
		async (_ctx, e, next) => {
			seen.push(e);
			return next(e);
		},
		{ id: 'test.observer', tier: 'extension' }
	);
	const { result } = renderHook(() => useCartCommand('cart.line.split'));
	mockCurrent = selected; // the cashier switched tabs after the hook rendered
	await act(async () => {
		await result.current(split, () => ({}));
	});
	expect(seen).toEqual([
		{ event: 'cart.line.split', orderId: 'selected', actor, source: 'user', payload },
	]);
	expect(mockPatch).toHaveBeenCalledWith(
		expect.objectContaining({
			document: selected,
			data: expect.objectContaining({ line_items: lines }),
		})
	);
});

it('holds the order slot: a queued command waits, then lands on the saved order left on it', async () => {
	const savedOrder = order('shown');
	let release!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	const ahead = enqueueOrderMutation('shown', async (queue) => {
		await gate;
		queue.order = savedOrder;
	});
	const run = jest.fn(async (slot: Slot) => split(slot).then(() => slot.target));
	const { result } = renderHook(() => useCartCommand('cart.line.split'));
	const pending = result.current(run, () => ({}));
	mockCurrent = selected; // a later switch does not move a command already pressed
	await Promise.resolve();
	expect(run).not.toHaveBeenCalled();
	release();
	await ahead;
	await expect(pending).resolves.toBe(savedOrder);
	expect(mockPatch).toHaveBeenCalledWith(expect.objectContaining({ document: savedOrder }));
});

it('presents a refusal once and answers false, or hands it back unpresented to the caller', async () => {
	registerActionHook('cart.line.split', async () => ({ deny: { reasonKey: 'test.locked' } }), {
		id: 'test.guard',
		tier: 'guard',
	});
	const { result } = renderHook(() => useCartCommand('cart.line.split'));
	await expect(
		result.current(split, (record) => ({ orderId: record.payload.id, uuid: 'line' }))
	).resolves.toBe(false);
	expect(mockLog).toHaveBeenCalledTimes(1);
	expect(mockLog).toHaveBeenCalledWith('warn', 'test.locked', {
		showToast: true,
		context: { orderId: 17, uuid: 'line', reasonKey: 'test.locked' },
	});

	mockLog.mockClear();
	const outcome = await result.current(split, 'caller');
	expect(isActionRefusal(outcome)).toBe(true);
	expect(mockLog).not.toHaveBeenCalled();
	expect(mockPatch).not.toHaveBeenCalled();
});

it('writes the snapshot the bottom computed from, and the caller-named order over the current one', async () => {
	const snapshot = order('selected');
	const { result } = renderHook(() => useCartCommand('cart.line.split'));
	await act(async () => {
		await result.current(
			async ({ dispatch }) =>
				dispatch(payload, (_e, write) => write({ line_items: lines }, snapshot)),
			() => ({}),
			selected
		);
	});
	expect(mockPatch).toHaveBeenCalledTimes(1);
	expect(mockPatch).toHaveBeenCalledWith(expect.objectContaining({ document: snapshot }));
});
