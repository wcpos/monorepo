import { MoneyCommandError } from '@wcpos/query';

import { legFinality, RETIRE_RETRY_MS, terminalBeforeSend } from './leg-finality';

type LegError = { code: string; message: string } | null;

function gateWith(intent: string | null, retires: ('ok' | 'fail')[], stopWhileWaiting = false) {
	let stopped = false;
	let state: { error: LegError } = { error: { code: 'wcpos_payment_locked', message: 'Locked' } };
	const shown: (string | null)[] = [];
	const retire = jest.fn(async (_kind: 'intent', _target: string) => {
		if (retires.shift() === 'fail') throw new Error('journal write failed');
	});
	const setTimeout = jest.fn((resolve: () => void, _ms: number) => {
		if (stopWhileWaiting) stopped = true;
		resolve();
		return 0 as unknown as ReturnType<typeof globalThis.setTimeout>;
	});
	const gate = legFinality(
		{ retire, setTimeout, clearTimeout: jest.fn() },
		() => (stopped ? null : state),
		(changes) => {
			state = { ...state, ...changes };
			shown.push(changes.error?.code ?? null);
		}
	);
	gate.intent = intent;
	return { gate, retire, setTimeout, shown };
}

// A leg is never final while its intent is unanswered and unretired (ADR 0040 §1.3).
it.each([
	['answered: nothing to retire', null, [], false, true, 0, []],
	['unanswered: retired, then final', 'leg', ['ok'], false, true, 1, ['wcpos_payment_locked']],
	[
		'a failed retirement is retried, then final with the earlier reason',
		'leg',
		['fail', 'ok'],
		false,
		true,
		2,
		['retire_failed', 'wcpos_payment_locked'],
	],
	['a leg stopped mid-retry never publishes', 'leg', ['fail', 'ok'], true, false, 1, []],
] as const)('the finality gate: %s', async (_, intent, retires, stop, final, calls, shown) => {
	const c = gateWith(intent, [...retires], stop);
	await expect(c.gate.settle()).resolves.toBe(final);
	expect(c.retire).toHaveBeenCalledTimes(calls);
	if (calls) expect(c.retire).toHaveBeenCalledWith('intent', 'leg');
	if (retires[0] === 'fail')
		expect(c.setTimeout).toHaveBeenCalledWith(expect.any(Function), RETIRE_RETRY_MS);
	if (final) expect(c.shown).toEqual(shown);
	expect(c.gate.settling).toBe(!final);
});

it.each([
	['intent', new MoneyCommandError('order_changed', {} as never), 'order_changed'],
	['intent', new MoneyCommandError('preflight_failed', {} as never), 'preflight_failed'],
	['intent', new MoneyCommandError('in_flight', {} as never), null],
	['intent', new Error('Network Error'), null],
	['capture', new MoneyCommandError('preflight_failed', {} as never), null],
	['void', new MoneyCommandError('preflight_failed', {} as never), null],
])('a %s refused with %p ends its leg: %p', (route, error, code) => {
	expect(terminalBeforeSend(route, error)?.code ?? null).toBe(code);
});
