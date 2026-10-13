import {
	createActionContext,
	dispatchAction,
	getActionHooks,
	ORDER_VOID_EVENT,
	ORDER_VOID_GUARD_IDS,
	resetActionHookStrikes,
} from '../../../../extensions/actions';
import { createDispatchToken } from '../../../../extensions/actions/registry';
import { auditOrderVoided } from './void-audit-hook';
import { paymentsGate } from './void-guards';

import type { ActionEventInput } from '../../../../extensions/actions';

const log = jest.fn();
const ctx = createActionContext({
	log,
	t: (key) => key,
	now: () => Date.now(),
	readCatalog: async () => null,
	readPaymentMethod: () => null,
	preventOverselling: false,
	priceDecimals: 2,
	resolveSession: async () => ({ registerId: null, sessionId: null }),
});
const e: ActionEventInput<typeof ORDER_VOID_EVENT> = {
	event: ORDER_VOID_EVENT,
	orderId: 'order',
	source: 'user',
	actor: { userId: 7, registerId: 'till', sessionId: null },
	payload: {
		orderId: 42,
		orderNumber: '42',
		status: 'pos-open',
		registerId: 'till',
		sessionId: null,
		actor: { id: '7', name: 'Pat' },
		paymentLegs: { live: 0, captured: 0, device: 0 },
	},
};
const bottom = jest.fn(async (): Promise<{ kind: 'removed' | 'kept-cancelled' }> => ({
	kind: 'removed',
}));
beforeEach(() => {
	jest.clearAllMocks();
	resetActionHookStrikes();
});

it.each([
	[{ live: 0, captured: 0, device: 0 }, true],
	[{ live: 1, captured: 0, device: 0 }, false],
	[{ live: 0, captured: 1, device: 0 }, false],
	[{ live: 1, captured: 2, device: 1 }, false],
])('payments gate: legs %j let the void through: %s', async (paymentLegs, allowed) => {
	const result = await paymentsGate(ctx, { ...e, payload: { ...e.payload, paymentLegs } }, bottom);
	if (allowed) {
		expect(result).toEqual({ kind: 'removed' });
		expect(bottom).toHaveBeenCalledTimes(1);
	} else {
		expect(result).toEqual({
			deny: {
				reasonKey: 'pos_cart.void_payments_first',
				detail: { event: ORDER_VOID_EVENT, live: paymentLegs.live, captured: paymentLegs.captured },
			},
		});
		expect(bottom).not.toHaveBeenCalled();
	}
});
it('a void needs no open session: the gate never reads one', async () => {
	await paymentsGate(ctx, e, bottom);
	expect(bottom).toHaveBeenCalledTimes(1);
});
it('the audit row is written after the writer, with the outcome and who did it', async () => {
	bottom.mockResolvedValueOnce({ kind: 'kept-cancelled' });
	expect(await auditOrderVoided(ctx, e, bottom)).toEqual({ kind: 'kept-cancelled' });
	expect(log).toHaveBeenCalledWith(
		'info',
		'Order order voided',
		expect.objectContaining({
			category: ['wcpos', 'pos', 'cart', 'void'],
			actor: { id: '7', name: 'Pat' },
			context: {
				type: 'order.voided',
				orderId: 42,
				orderUUID: 'order',
				orderNumber: '42',
				status: 'pos-open',
				outcome: 'kept-cancelled',
				registerId: 'till',
				sessionId: null,
			},
		})
	);
	expect(log.mock.invocationCallOrder[0]).toBeGreaterThan(bottom.mock.invocationCallOrder[0]);
});
it('a refused void writes no audit row: through the real chain, the gate refuses and the hook stays quiet', async () => {
	const legs = {
		...e,
		payload: { ...e.payload, paymentLegs: { live: 0, captured: 1, device: 0 } },
	};
	const result = await dispatchAction({
		event: ORDER_VOID_EVENT,
		requiredGuards: ORDER_VOID_GUARD_IDS,
		input: legs,
		ctx,
		token: createDispatchToken(),
		bottom,
	});
	expect(result).toMatchObject({ deny: { reasonKey: 'pos_cart.void_payments_first' } });
	expect(bottom).not.toHaveBeenCalled();
	expect(log).not.toHaveBeenCalledWith('info', expect.anything(), expect.anything());
});
it('registers the gate as a guard and the audit as an extension', () => {
	expect(getActionHooks(ORDER_VOID_EVENT).map(({ id, tier }) => ({ id, tier }))).toEqual([
		{ id: 'audit.order-voided', tier: 'extension' },
		{ id: 'payments.gate', tier: 'guard' },
	]);
});
