import { expect, it } from 'vitest';

import { mergeProtectedOrderMeta } from './merge-protected-order-meta';

it.each([
	['_wcpos_money_owner_hint', 'server', null, undefined, 8, 'server', 8, 'server'],
	['_wcpos_money_owner_hint', null, 'server', 8, undefined, 'server', 8, 'server'],
	['is_vat_exempt', 'yes', 'no', undefined, 10, 'no', 10, 'mutation'],
	['_pos_user', 'local', 'remote', undefined, 9, 'local', 9, 'server'],
] as const)(
	'merges %s (%s / %s), retaining identity',
	(key, local, remote, localId, remoteId, value, id, source) => {
		expect(
			mergeProtectedOrderMeta(
				[{ key, value: local, id: localId }],
				[{ key, value: remote, id: remoteId }],
				source
			)
		).toEqual([{ key, value, id }]);
	}
);

it.each(['server', 'mutation'] as const)(
	'deduplicates protected aliases by row identity: %s',
	(source) => {
		const genuine = { id: 9, key: '_pos_user', value: 'cashier' };
		const alias = { id: 3, key: '_pos_user', value: 'renamed ordinary row' };
		expect(mergeProtectedOrderMeta([genuine], [alias, genuine], source)).toEqual([genuine]);
		expect(
			mergeProtectedOrderMeta([], [{ key: '_pos_user', value: 'alias' }, genuine], source)
		).toEqual([genuine]);
		const hint = { id: 8, key: '_wcpos_money_owner_hint', value: 'server' };
		expect(mergeProtectedOrderMeta([hint], [{ ...hint, value: null }, hint], source)).toEqual([
			hint,
		]);
	}
);

it('the epoch-era stamp is plain meta, while the local hint survives server adoption', () => {
	const stamp = { key: '_wcpos_money_owner', value: 'server' };
	const hint = { key: '_wcpos_money_owner_hint', value: 'server' };
	expect(mergeProtectedOrderMeta([stamp, hint], [])).toEqual([hint]);
	expect(mergeProtectedOrderMeta([hint], [stamp])).toEqual([stamp, hint]);
	expect(mergeProtectedOrderMeta([stamp], [{ ...stamp, value: null }])).toEqual([
		{ ...stamp, value: null },
	]);
	expect(mergeProtectedOrderMeta([stamp], [], 'mutation')).toEqual([]);
});

it('retains VAT exemption when a mutation omits it', () => {
	const row = { id: 42, key: 'is_vat_exempt', value: 'yes' };
	expect(mergeProtectedOrderMeta([row], [], 'mutation')).toEqual([row]);
});
