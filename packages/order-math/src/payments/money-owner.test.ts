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
