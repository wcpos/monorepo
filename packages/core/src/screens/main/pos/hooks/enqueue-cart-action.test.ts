import { enqueueCartAction } from './enqueue-cart-action';
import { resetOrderMutationQueues } from './order-mutation-queue';
import {
	createActionContext,
	dispatchAction,
	resetActionRegistry,
} from '../../../../extensions/actions';

import type { CurrentOrderRecord } from '../contexts/current-order';

const record = { uuid: 'order' } as CurrentOrderRecord;
const saved = { uuid: 'order', payload: { id: 17 } } as CurrentOrderRecord;
const refusal = { deny: { reasonKey: 'pos_cart.only_n_available', params: { count: 2 } } };
const log = jest.fn();
const ctx = createActionContext({
	log,
	t: (key) => key,
	readCatalog: async () => null,
	readPaymentMethod: () => null,
	preventOverselling: false,
	priceDecimals: 2,
	resolveSession: async () => ({ registerId: null, sessionId: null }),
});
const present = { ctx, context: { orderId: 'order' } };

beforeEach(() => {
	resetOrderMutationQueues();
	resetActionRegistry();
	jest.clearAllMocks();
});

// Catches resolving the target before entering the queue, or passing a copied/bare context.
it('lands on queue.order when a first add left one', async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const first = enqueueCartAction(
		record,
		async (target, queue) => {
			expect(target).toBe(record);
			await gate;
			queue.order = saved;
			return saved;
		},
		present
	);
	const second = enqueueCartAction(
		record,
		async (target, queue) => {
			expect(target).toBe(saved);
			expect(queue.order).toBe(saved);
			return dispatchAction({
				event: 'cart.line.add',
				token: queue.dispatchToken,
				ctx,
				input: {
					orderId: target.uuid,
					actor: { userId: null, registerId: null, sessionId: null },
					source: 'user',
					payload: { type: 'line_items', line: {}, lineItems: [] },
				},
				bottom: async () => target,
			});
		},
		present
	);
	release();
	expect(await first).toBe(saved);
	expect(await second).toBe(saved);
});

// Catches losing/doubling presentation, its context, or the false return mapping.
it('presents a refusal once and returns false', async () => {
	expect(await enqueueCartAction(record, async () => refusal, present)).toBe(false);
	expect(log).toHaveBeenCalledTimes(1);
	expect(log).toHaveBeenCalledWith('warn', 'pos_cart.only_n_available', {
		showToast: true,
		context: { orderId: 'order', reasonKey: 'pos_cart.only_n_available' },
	});
	await enqueueCartAction(
		record,
		async () => ({ deny: { ...refusal.deny, presented: true } }),
		present
	);
	expect(log).toHaveBeenCalledTimes(1);
});

// Catches presenting despite caller ownership (e.g. a coupon field's error).
it('leaves presentation to the caller in caller mode', async () => {
	expect(await enqueueCartAction(record, async () => refusal, 'caller')).toBe(false);
	expect(log).not.toHaveBeenCalled();
});

// Catches converting a failed write into a refusal or a successful result.
it('propagates a writer error', async () => {
	const error = new Error('writer failed');
	await expect(
		enqueueCartAction(
			record,
			async () => {
				throw error;
			},
			present
		)
	).rejects.toBe(error);
	expect(log).not.toHaveBeenCalled();
});
