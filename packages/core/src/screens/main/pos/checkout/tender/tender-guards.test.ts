import {
	createActionContext,
	dispatchAction,
	getActionHooks,
	resetActionHookStrikes,
} from '../../../../../extensions/actions';
import { createDispatchToken } from '../../../../../extensions/actions/registry';
import { RegisterSessionRequiredError } from '../../../../../services/register-session/session-store';
import { registerGate, sessionGate } from './tender-guards';

import type { ActionEventInput } from '../../../../../extensions/actions';

const resolveSession = jest.fn();
const ctx = createActionContext({
	log: jest.fn(),
	t: (key) => key,
	now: () => Date.now(),
	readCatalog: async () => null,
	preventOverselling: false,
	resolveSession,
});
const e: ActionEventInput<'checkout.tender.commit'> = {
	event: 'checkout.tender.commit',
	orderId: 'order',
	source: 'user',
	actor: { userId: 7, registerId: null, sessionId: null },
	payload: {
		methodId: 'cash',
		mode: 'manual',
		amountMinor: 100,
		tenderedMinor: 100,
		balanceMinor: 100,
		completing: true,
		bindingStatus: 'bound',
		registerId: null,
		sessionId: null,
	},
};
const bottom = jest.fn();
beforeEach(() => {
	jest.clearAllMocks();
	resetActionHookStrikes();
	resolveSession.mockResolvedValue({ registerId: 'register', sessionId: 'session' });
	bottom.mockResolvedValue('saved');
});
it.each(['bound', 'choose', 'none'] as const)(
	'register gate truth table: %s',
	async (bindingStatus) => {
		for (const completing of [false, true]) {
			bottom.mockClear();
			const event = { ...e, payload: { ...e.payload, completing, bindingStatus } };
			const result = await registerGate(ctx, event, bottom);
			if (completing && bindingStatus === 'choose') {
				expect(result).toEqual({
					deny: { reasonKey: 'pos_checkout.choose_register_first', detail: { event: e.event } },
				});
				expect(bottom).not.toHaveBeenCalled();
			} else {
				expect(result).toBe('saved');
				expect(bottom).toHaveBeenCalledWith(event);
			}
		}
	}
);
it('session gate stamps the resolved register and session into the bottom payload', async () => {
	expect(
		await dispatchAction({ event: e.event, input: e, ctx, token: createDispatchToken(), bottom })
	).toBe('saved');
	expect(bottom).toHaveBeenCalledWith({
		...e,
		payload: { ...e.payload, registerId: 'register', sessionId: 'session' },
	});
});
it('session gate refuses a missing open session without reaching bottom', async () => {
	resolveSession.mockRejectedValueOnce(new RegisterSessionRequiredError());
	expect(await sessionGate(ctx, e, bottom)).toEqual({
		deny: { reasonKey: 'pos_checkout.open_register_first', detail: { event: e.event } },
	});
	expect(bottom).not.toHaveBeenCalled();
});
it('session gate rethrows other errors', async () => {
	const error = new Error('storage unavailable');
	resolveSession.mockRejectedValueOnce(error);
	await expect(sessionGate(ctx, e, bottom)).rejects.toBe(error);
	expect(bottom).not.toHaveBeenCalled();
});
it('registers both gates in order as guards', () => {
	expect(getActionHooks(e.event)).toEqual([
		{ id: 'register.gate', tier: 'guard', order: 0, hook: registerGate },
		{ id: 'session.gate', tier: 'guard', order: 1, hook: sessionGate },
	]);
});
