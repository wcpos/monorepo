import { protectOrderMeta } from '../../src/mutations/protected-order-meta';

describe.each(['_wcpos_money_owner_hint', '_wcpos_money_owner'])('%s', (key) => {
	const current = { meta_data: [{ key, value: 'server', id: 8 }] };
	it.each(['stale', 'server'])('keeps durable ownership and the Woo id over %s', (value) => {
		expect(protectOrderMeta(current, { meta_data: [{ key, value }] })).toEqual(current);
	});
});

it.each(['_wcpos_completed_at', '_wcpos_completions', '_wcpos_commands', '_wcpos_payments'])(
	'editor cannot delete or overwrite server-owned %s',
	(key) => {
		const current = { meta_data: [{ key, value: '2', id: 9 }] };
		for (const value of [null, '0']) {
			expect(protectOrderMeta(current, { meta_data: [{ key, value, id: 9 }] })).toEqual(current);
		}
	}
);

// ADR 0040: the server owns these keys; only its ack (or a local-only mirror) moves them.
it('a queued write cannot change a server-owned meta key on the resident', () => {
	const current = {
		meta_data: [
			{ id: 9, key: '_wcpos_payments', value: { schema: 1, payments: [{ id: 'server' }] } },
			{ id: 10, key: '_wcpos_completions', value: [{ n: 1 }] },
		],
	};
	const stale = {
		meta_data: [
			{ id: 9, key: '_wcpos_payments', value: { schema: 1, payments: [] } },
			{ key: 'custom', value: 'edited' },
		],
	};
	const meta = protectOrderMeta(current, stale).meta_data as unknown[];
	expect(meta).toHaveLength(3);
	expect(meta).toEqual(
		expect.arrayContaining([...current.meta_data, { key: 'custom', value: 'edited' }])
	);
});
