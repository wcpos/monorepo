import {
	CHECKOUT_COMPLETE_EVENT,
	createActionContext,
	getActionHooks,
} from '../../../../extensions/actions';
import { auditSaleCompleted } from './audit-hook';

import type { ActionEventInput, ActionResult } from '../../../../extensions/actions';

const log = jest.fn();
const ctx = createActionContext({
	log,
	t: (key) => key,
	readCatalog: async () => null,
	preventOverselling: false,
	resolveSession: async () => ({ registerId: null, sessionId: null }),
});
const event: ActionEventInput<typeof CHECKOUT_COMPLETE_EVENT> = {
	event: CHECKOUT_COMPLETE_EVENT,
	orderId: 'order',
	source: 'user',
	actor: { userId: 7, registerId: 'register', sessionId: 'session' },
	payload: { source: 'manual', presentation: 'stage', actor: { id: '7', name: 'Pat' } },
};
const completed: ActionResult<typeof CHECKOUT_COMPLETE_EVENT> = {
	outcome: 'completed',
	summary: { orderId: 42, orderUUID: 'order', orderNumber: '1042', total: '50.00', paymentLegs: 2 },
};
beforeEach(() => jest.clearAllMocks());
it.each(['user', 'system', 'replay'] as const)(
	'logs the complete audit row after work for %s',
	async (source) => {
		const next = jest.fn(async () => {
			expect(log).not.toHaveBeenCalled();
			return completed;
		});
		expect(await auditSaleCompleted(ctx, { ...event, source }, next)).toBe(completed);
		expect(next).toHaveBeenCalledWith({ ...event, source });
		expect(log.mock.calls).toEqual([
			[
				'info',
				'Sale order completed',
				{
					category: ['wcpos', 'pos', 'checkout'],
					actor: { id: '7', name: 'Pat' },
					context: {
						type: 'checkout.completed',
						...(source === 'replay' ? { replayed: true } : {}),
						orderId: 42,
						orderUUID: 'order',
						orderNumber: '1042',
						total: '50.00',
						paymentLegs: 2,
						hookIds: [],
					},
				},
			],
		]);
	}
);
it.each(['partial', 'not-completed', 'sent'] as const)('does not log %s', async (outcome) => {
	const result = { outcome, summary: null };
	expect(await auditSaleCompleted(ctx, event, async () => result)).toBe(result);
	expect(log).not.toHaveBeenCalled();
});
it('does not log a completion without a summary', async () => {
	await auditSaleCompleted(ctx, event, async () => ({ outcome: 'completed', summary: null }));
	expect(log).not.toHaveBeenCalled();
});
it('registers only the extension observer with order zero', () => {
	expect(getActionHooks(CHECKOUT_COMPLETE_EVENT)).toEqual([
		{ id: 'audit.sale-completed', tier: 'extension', order: 0, hook: auditSaleCompleted },
	]);
});
