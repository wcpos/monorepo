import { expect, it } from 'vitest';

import { mergeProtectedOrderMeta } from './merge-protected-order-meta';

it.each([
	['_wcpos_money_owner_hint', 'server', null, undefined, 8, 'server', 8, 'server'],
	['_wcpos_money_owner_hint', null, 'server', 8, undefined, 'server', 8, 'server'],
	['is_vat_exempt', 'yes', 'no', undefined, 10, 'no', 10, 'mutation'],
	['is_vat_exempt', 'no', 'yes', undefined, 10, 'yes', 10, 'server'],
	['_pos_user', 'local', 'remote', undefined, 9, 'local', 9, 'server'],
	['_pos_user', 'local', 'remote', 8, 9, 'remote', 9, 'read'],
	['_pos_user', 'local', 'remote', 8, undefined, 'remote', 8, 'read'],
	['_pos_user', 'local', 'remote', undefined, 9, 'remote', 9, 'read'],
	['_pos_store', 'local', 'remote', 8, 9, 'remote', 9, 'read'],
	['_pos_store', 'local', 'remote', 8, undefined, 'remote', 8, 'read'],
	['_pos_store', 'local', 'remote', undefined, 9, 'remote', 9, 'read'],
	['_woocommerce_pos_tax_based_on', 'shipping', 'billing', undefined, 9, 'shipping', 9, 'read'],
	['_wcpos_money_owner_hint', 'server', null, undefined, 8, 'server', 8, 'read'],
	['_wcpos_money_owner_hint', null, 'server', 8, undefined, 'server', 8, 'read'],
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

it.each([
	['_pos_user', undefined],
	['_pos_user', ''],
	['_pos_user', null],
	['_pos_store', undefined],
	['_pos_store', ''],
	['_pos_store', null],
] as const)('a read keeps resident %s when incoming is %s', (key, value) => {
	const resident = { key, value: 'local', id: 9 };
	const incoming = value === undefined ? [] : [{ key, value }];
	expect(mergeProtectedOrderMeta([resident], incoming, 'read')).toEqual([resident]);
});

it.each(['server', 'read', 'mutation'] as const)(
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

it.each(['server', 'read'] as const)(
	'adopts and removes the server sale-day correction on %s',
	(source) => {
		const local = {
			id: 42,
			key: '_wcpos_sale_day',
			value: JSON.stringify({ at_gmt: '2026-11-23T09:12:00Z', reason: 'Local' }),
		};
		const remote = {
			...local,
			value: JSON.stringify({ at_gmt: '2026-11-22T09:12:00Z', reason: 'Server' }),
		};
		expect(mergeProtectedOrderMeta([local], [remote], source)).toEqual([remote]);
		expect(mergeProtectedOrderMeta([local], [], source)).toEqual([]);
	}
);
it('keeps the server sale-day fact on mutation, retaining it when omitted', () => {
	const local = { id: 42, key: '_wcpos_sale_day', value: 'resident' };
	const edited = { key: '_wcpos_sale_day', value: 'edited' };
	expect(mergeProtectedOrderMeta([local], [edited], 'mutation')).toEqual([local]);
	expect(mergeProtectedOrderMeta([local], [], 'mutation')).toEqual([local]);
});

it('protects the request from omission while letting the editor replace it', () => {
	const local = { key: '_wcpos_sale_day_request', value: 'old request' };
	const edited = { ...local, value: 'new request' };
	expect(mergeProtectedOrderMeta([local], [edited], 'mutation')).toEqual([
		{ ...edited, id: undefined },
	]);
	expect(mergeProtectedOrderMeta([local], [], 'mutation')).toEqual([{ ...local, id: undefined }]);
});
