import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import {
	createActionContext,
	dispatchAction,
	registerActionHook,
	resetActionRegistry,
	TENDER_COMMIT_EVENT,
} from '../../../../extensions/actions';
import { createDispatchToken } from '../../../../extensions/actions/registry';
import { cashRounding } from './cash-rounding-hook';

import type { ActionEventInput } from '../../../../extensions/actions';

const cash = {
	schema: 1,
	id: 'pos_cash',
	title: 'Cash',
	kind: 'cash',
	pos_enabled: true,
	order: 1,
	capture: { mode: 'manual', provider: null, hardware: null, webview_available: false },
	capabilities: {
		amount: { partial: true },
		change: true,
		refunds: { via: 'manual', partial: true },
		tips: 'none',
		offline: 'record',
		void: false,
	},
	defaults: {
		order_status: 'completed',
		rounding: { increment: '0.05', mode: 'nearest' },
		open_drawer: true,
	},
	provider_data: {},
} satisfies PaymentMethodDescriptor;
const methods: Record<string, PaymentMethodDescriptor> = {
	pos_cash: cash,
	no_increment: { ...cash, id: 'no_increment', defaults: { ...cash.defaults, rounding: null } },
	pos_card: { ...cash, id: 'pos_card', kind: 'card' },
};
const ctx = createActionContext({
	log: jest.fn(),
	t: (key) => key,
	readCatalog: async () => null,
	readPaymentMethod: (id) => methods[id] ?? null,
	preventOverselling: false,
	priceDecimals: 2,
	resolveSession: async () => ({ registerId: null, sessionId: null }),
});
type Payload = ActionEventInput<typeof TENDER_COMMIT_EVENT>['payload'];
const tender = (payload: Partial<Payload>): ActionEventInput<typeof TENDER_COMMIT_EVENT> => ({
	event: TENDER_COMMIT_EVENT,
	orderId: 'order',
	source: 'user',
	actor: { userId: 7, registerId: null, sessionId: null },
	payload: {
		methodId: 'pos_cash',
		mode: 'manual',
		amountMinor: 1003,
		tenderedMinor: 1005,
		balanceMinor: 1003,
		roundingMinor: 0,
		bindingStatus: 'bound',
		registerId: null,
		sessionId: null,
		conditions: { unmet: [] },
		...payload,
	},
});
const bottom = jest.fn(async (_e: ActionEventInput<typeof TENDER_COMMIT_EVENT>) => 'written');
const dispatch = (input: ActionEventInput<typeof TENDER_COMMIT_EVENT>) =>
	dispatchAction({ event: TENDER_COMMIT_EVENT, input, ctx, token: createDispatchToken(), bottom });

beforeEach(() => {
	jest.clearAllMocks();
	resetActionRegistry();
	registerActionHook(TENDER_COMMIT_EVENT, cashRounding, {
		id: 'cash.rounding',
		tier: 'extension',
		order: 0,
	});
});

it.each([
	['a round-up', { amountMinor: 1003, tenderedMinor: 2000, balanceMinor: 1003 }, 1005, 2],
	// The cashier may hand exactly the rounded-down due, below the balance: that settles it.
	['a round-down', { amountMinor: 1000, tenderedMinor: 1000, balanceMinor: 1002 }, 1000, -2],
	['a due rounded to nothing', { amountMinor: 0, tenderedMinor: 0, balanceMinor: 2 }, 0, -2],
	// A split share within the rounding of the balance, paid with a big note, settles the sale.
	[
		'a share that settles',
		{ amountMinor: 1001, tenderedMinor: 2000, balanceMinor: 1002 },
		1000,
		-2,
	],
])(
	'rewrites a settling cash tender to the rounded due: %s',
	async (_name, facts, due, rounding) => {
		await expect(dispatch(tender(facts))).resolves.toBe('written');
		expect(bottom.mock.calls[0][0].payload).toEqual({
			...tender(facts).payload,
			amountMinor: due,
			balanceMinor: due,
			roundingMinor: rounding,
		});
	}
);

it.each([
	['a card tender', { methodId: 'pos_card', mode: 'server' }],
	['a method without an increment', { methodId: 'no_increment' }],
	['a balance already on the increment', { amountMinor: 1005, balanceMinor: 1005 }],
	// Short of the rounded due: an exact unrounded payment, legitimate (and the writer refuses change below zero).
	['notes short of the rounded due', { tenderedMinor: 1004 }],
	['an exact unrounded payment', { amountMinor: 1003, tenderedMinor: 1003 }],
	// A split share is not the sale: the cashier hands what they hand.
	['a partial split leg', { amountMinor: 500, tenderedMinor: 2000 }],
])('passes through %s', async (_name, facts) => {
	await expect(dispatch(tender(facts))).resolves.toBe('written');
	expect(bottom).toHaveBeenCalledWith(tender(facts));
});

it('a guard judges the rewritten amounts, and a refusal after the rewrite reaches no writer', async () => {
	const seen = jest.fn();
	registerActionHook(
		TENDER_COMMIT_EVENT,
		async (_ctx, e) => {
			seen(e.payload);
			return { deny: { reasonKey: 'pos_checkout.open_register_first' } };
		},
		{ id: 'test.refuse', tier: 'guard', order: 0 }
	);
	await expect(dispatch(tender({}))).resolves.toEqual({
		deny: { reasonKey: 'pos_checkout.open_register_first' },
	});
	expect(seen).toHaveBeenCalledWith(
		expect.objectContaining({ amountMinor: 1005, balanceMinor: 1005, roundingMinor: 2 })
	);
	expect(bottom).not.toHaveBeenCalled();
});
