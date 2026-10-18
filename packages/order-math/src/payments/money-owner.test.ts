import { serverOwnsMoney } from '../index';

it.each(['_wcpos_money_owner', '_wcpos_money_owner_hint'])(
	'recognizes %s only for server',
	(key) => {
		expect(serverOwnsMoney([{ key, value: 'server' }])).toBe(true);
		expect(serverOwnsMoney([{ key, value: 'pos' }])).toBe(false);
		expect(serverOwnsMoney([{ key, value: null }])).toBe(false);
	}
);
it.each([undefined, null, [], [{ key: 'other', value: 'server' }]])(
	'rejects absent ownership: %j',
	(meta) => {
		expect(serverOwnsMoney(meta)).toBe(false);
	}
);

it.each([
	['1.3', '_wcpos_money_owner_hint', false],
	['1.3', '_wcpos_money_owner', true],
	['1.2', '_wcpos_money_owner_hint', true],
	[null, '_wcpos_money_owner_hint', true],
] as const)('ownership at %s uses %s', (storeContract, key, owned) => {
	expect(serverOwnsMoney([{ key, value: 'server' }], { storeContract })).toBe(owned);
});
