import { RegisterSessionRequiredError } from '@wcpos/query/register-session';

import {
	createActionContext,
	dispatchAction,
	getActionHooks,
	resetActionHookStrikes,
	TENDER_GUARD_IDS,
} from '../../../../../extensions/actions';
import {
	createDispatchToken,
	registerActionHook,
	resetActionRegistry,
} from '../../../../../extensions/actions/registry';
import { conditionsGate, registerGate, sessionGate } from './tender-guards';

import type { ActionEventInput } from '../../../../../extensions/actions';

type Payload = ActionEventInput<'checkout.tender.commit'>['payload'];

const resolveSession = jest.fn();
const ctx = createActionContext({
	log: jest.fn(),
	t: (key) => key,
	now: () => Date.now(),
	readCatalog: async () => null,
	readPaymentMethod: () => null,
	preventOverselling: false,
	priceDecimals: 2,
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
		roundingMinor: 0,
		bindingStatus: 'bound',
		registerId: null,
		sessionId: null,
		conditions: { unmet: [] },
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
			// Completing is judged on the amounts the writer will write.
			const amountMinor = completing ? 100 : 40;
			const event = {
				...e,
				payload: { ...e.payload, amountMinor, bindingStatus },
			};
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
it('registers the three gates in order as guards', () => {
	expect(getActionHooks(e.event)).toEqual([
		{ id: 'register.gate', tier: 'guard', order: 0, hook: registerGate },
		{ id: 'session.gate', tier: 'guard', order: 1, hook: sessionGate },
		{ id: 'conditions.gate', tier: 'guard', order: 2, hook: conditionsGate },
	]);
});

describe('conditions gate (roadmap#62)', () => {
	const over = {
		id: 'stock',
		reasonKey: 'pos_cart.only_n_available',
		params: { quantity: 2, name: 'Belt' },
		lineUuid: 'belt',
	};
	const out = {
		id: 'stock',
		reasonKey: 'pos_products.out_of_stock',
		params: { name: 'Beanie' },
		lineUuid: 'beanie',
	};
	const withUnmet = (unmet: Payload['conditions']['unmet']) => ({
		...e,
		payload: { ...e.payload, conditions: { unmet } },
	});
	const gates = [registerGate, sessionGate, conditionsGate] as const;
	const registerTenderGuards = (count: number) =>
		TENDER_GUARD_IDS.slice(0, count).forEach((id, order) =>
			registerActionHook(e.event, gates[order], { id, tier: 'guard', order })
		);
	beforeEach(() => {
		resetActionRegistry();
		registerTenderGuards(3);
	});
	afterAll(() => {
		resetActionRegistry();
		registerTenderGuards(3);
	});

	it('refuses with the first unmet line’s reason, and the writer never runs', async () => {
		const result = await dispatchAction({
			event: e.event,
			input: withUnmet([over, out]),
			ctx,
			token: createDispatchToken(),
			requiredGuards: TENDER_GUARD_IDS,
			bottom,
		});
		expect(result).toEqual({
			deny: {
				reasonKey: 'pos_cart.only_n_available',
				params: { quantity: 2, name: 'Belt' },
				detail: { event: e.event, lineUuid: 'belt' },
			},
		});
		expect(bottom).not.toHaveBeenCalled();
	});

	it('passes with nothing unmet (a backorder warning is never counted)', async () => {
		expect(await conditionsGate(ctx, withUnmet([]), bottom)).toBe('saved');
		expect(bottom).toHaveBeenCalledWith(withUnmet([]));
	});

	it('a dispatch without it registered refuses as guard_missing, unguarded never', async () => {
		resetActionRegistry();
		registerTenderGuards(2);
		const result = await dispatchAction({
			event: e.event,
			input: withUnmet([]),
			ctx,
			token: createDispatchToken(),
			requiredGuards: TENDER_GUARD_IDS,
			bottom,
		});
		expect(result).toMatchObject({ deny: { reasonKey: 'actions.guard_missing' } });
		expect(bottom).not.toHaveBeenCalled();
	});
});
