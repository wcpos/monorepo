import {
	type CheckoutBody,
	checkoutBodyFor,
	leaveOrCancel,
	offersCancelPayment,
} from './checkout-body';
import { initialTenderState } from './tender-state';

import type { TenderFlow } from './use-tender-flow';

const terminalLeg = {} as NonNullable<TenderFlow['terminalLeg']>;
const unansweredAttempt = {} as NonNullable<TenderFlow['unansweredAttempt']>;

function flowWith(overrides: Partial<TenderFlow> = {}): TenderFlow {
	return {
		unansweredCommand: false,
		terminalLeg: null,
		hasLiveTerminalLeg: false,
		hasLiveLeg: false,
		balanceMinor: 1000,
		unansweredAttempt: null,
		state: initialTenderState,
		dispatch: jest.fn(),
		...overrides,
	} as TenderFlow;
}

const cancelView = { ...initialTenderState, view: 'cancel' as const };
const legacyTab = { ...initialTenderState, tab: 'legacy' as const };

describe('checkoutBodyFor', () => {
	it.each<[string, Partial<TenderFlow>, CheckoutBody]>([
		['an unanswered command gates the checkout', { unansweredCommand: true }, 'gate'],
		[
			'the gate outranks the cancel view and the Legacy tab',
			{ unansweredCommand: true, state: { ...cancelView, tab: 'legacy' } },
			'gate',
		],
		[
			'a terminal leg on screen keeps its view through an unanswered command',
			{ unansweredCommand: true, terminalLeg },
			'pane',
		],
		['the cancel view', { state: cancelView }, 'cancel'],
		[
			'a live terminal leg is never hidden behind the cancel view',
			{ state: cancelView, terminalLeg, hasLiveTerminalLeg: true },
			'pane',
		],
		[
			'the cancel view outranks the Legacy tab',
			{ state: { ...cancelView, tab: 'legacy' } },
			'cancel',
		],
		['the Legacy tab', { state: legacyTab }, 'legacy'],
		[
			'a live terminal leg keeps the pane on the Legacy tab',
			{ state: legacyTab, terminalLeg, hasLiveTerminalLeg: true },
			'pane',
		],
		[
			'a final terminal leg keeps the pane on the Legacy tab',
			{ state: legacyTab, terminalLeg },
			'pane',
		],
		['the Legacy tab outranks a zero balance', { state: legacyTab, balanceMinor: 0 }, 'legacy'],
		['nothing left to take offers Done', { balanceMinor: 0 }, 'done'],
		[
			'an unanswered attempt keeps the pane at zero',
			{ balanceMinor: 0, unansweredAttempt },
			'pane',
		],
		['a terminal leg on screen keeps the pane at zero', { balanceMinor: 0, terminalLeg }, 'pane'],
		['a balance to take shows the pane', {}, 'pane'],
	])('%s', (_name, overrides, body) => {
		expect(checkoutBodyFor(flowWith(overrides))).toBe(body);
	});
});

describe('leaveOrCancel and offersCancelPayment', () => {
	it.each<[string, Partial<TenderFlow>, 'leave' | 'request-cancel' | 'nothing', boolean]>([
		['no live leg leaves', {}, 'leave', false],
		['a live manual leg asks to cancel', { hasLiveLeg: true }, 'request-cancel', true],
		[
			'a live manual leg with the cancel view open does nothing (idempotent)',
			{ hasLiveLeg: true, state: cancelView },
			'nothing',
			false,
		],
		[
			'a live terminal leg leaves; it finishes in the background',
			{ hasLiveLeg: true, hasLiveTerminalLeg: true, terminalLeg },
			'leave',
			false,
		],
	])('%s', (_name, overrides, action, offers) => {
		const flow = flowWith(overrides);
		const leave = jest.fn();
		leaveOrCancel(flow, { leave });
		expect(leave).toHaveBeenCalledTimes(action === 'leave' ? 1 : 0);
		if (action === 'request-cancel') {
			expect(flow.dispatch).toHaveBeenCalledWith({ type: 'request-cancel' });
		} else {
			expect(flow.dispatch).not.toHaveBeenCalled();
		}
		expect(offersCancelPayment(flow)).toBe(offers);
	});
});
