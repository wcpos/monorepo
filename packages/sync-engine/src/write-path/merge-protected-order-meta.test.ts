import { expect, it } from 'vitest';

import { mergeProtectedOrderMeta } from './merge-protected-order-meta';

it.each([
	['_wcpos_money_owner_hint', 'server', null, undefined, 8, 'server', 8],
	['_wcpos_money_owner_hint', null, 'server', 8, undefined, 'server', 8],
	['_pos_user', 'local', 'remote', undefined, 9, 'local', 9],
] as const)(
	'merges %s (%s / %s), retaining identity',
	(key, local, remote, localId, remoteId, value, id) => {
		expect(
			mergeProtectedOrderMeta(
				[{ key, value: local, id: localId }],
				[{ key, value: remote, id: remoteId }]
			)
		).toEqual([{ key, value, id }]);
	}
);
