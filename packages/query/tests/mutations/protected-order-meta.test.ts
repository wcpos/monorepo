import { protectOrderMeta } from '../../src/mutations/protected-order-meta';

describe.each(['_wcpos_money_owner_hint', '_wcpos_money_owner'])('%s', (key) => {
	const current = { meta_data: [{ key, value: 'server', id: 8 }] };
	it.each(['stale', 'server'])('keeps durable ownership and the Woo id over %s', (value) => {
		expect(protectOrderMeta(current, { meta_data: [{ key, value }] })).toEqual(current);
	});
});

it.each([
	'_wcpos_money_epoch',
	'_wcpos_completed_at',
	'_wcpos_completed_epoch',
	'_wcpos_completed_session',
	'_wcpos_reopened_at',
])('editor cannot delete or overwrite server-owned %s', (key) => {
	const current = { meta_data: [{ key, value: '2', id: 9 }] };
	for (const value of [null, '0']) {
		expect(protectOrderMeta(current, { meta_data: [{ key, value, id: 9 }] })).toEqual(current);
	}
});
