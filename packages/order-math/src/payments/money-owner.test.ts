import { serverOwnsMoney } from '../index';

it('recognizes the durable hint only for server', () => {
	const hint = (value: unknown) => [{ key: '_wcpos_money_owner_hint', value }];
	expect(serverOwnsMoney(hint('server'))).toBe(true);
	expect(serverOwnsMoney(hint('pos'))).toBe(false);
	expect(serverOwnsMoney(hint(null))).toBe(false);
});

it.each([undefined, null, [], [{ key: 'other', value: 'server' }]])(
	'rejects absent ownership: %j',
	(meta) => {
		expect(serverOwnsMoney(meta)).toBe(false);
	}
);

// ADR 0032's line-money ownership is not ADR 0040's payment authority: the
// contract does not enter it, and the epoch-era stamp no longer owns anything.
it('the durable hint owns money at every contract', () => {
	expect(serverOwnsMoney([{ key: '_wcpos_money_owner_hint', value: 'server' }])).toBe(true);
	expect(serverOwnsMoney([{ key: '_wcpos_money_owner', value: 'server' }])).toBe(false);
});
