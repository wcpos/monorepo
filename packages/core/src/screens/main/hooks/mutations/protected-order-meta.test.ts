import { protectOrderMeta } from './protected-order-meta';

describe.each(['_wcpos_money_owner_hint', '_wcpos_money_owner'])('%s', (key) => {
	const current = { meta_data: [{ key, value: 'server', id: 8 }] };
	it.each(['stale', 'server'])('keeps durable ownership and the Woo id over %s', (value) => {
		expect(protectOrderMeta(current, { meta_data: [{ key, value }] })).toEqual(current);
	});
});
