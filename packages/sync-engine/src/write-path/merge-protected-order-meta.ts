import { type MetaDataEntry, POS_META_KEYS, PROTECTED_ORDER_META_KEYS } from '@wcpos/sync-core';

/** POS identity and money-ownership metadata whose resident values survive server adoption. */
export const POS_ORDER_IDENTITY_META_KEYS = [
	POS_META_KEYS.user,
	POS_META_KEYS.store,
	POS_META_KEYS.taxBasedOn,
	'_wcpos_money_owner_hint',
] as const;

export function mergeProtectedOrderMeta(
	localMeta: MetaDataEntry[],
	incomingMeta: MetaDataEntry[],
	source: 'server' | 'mutation' = 'server'
) {
	const serverMeta = [...incomingMeta];
	const keys = source === 'mutation' ? PROTECTED_ORDER_META_KEYS : POS_ORDER_IDENTITY_META_KEYS;
	for (const key of keys) {
		const localEntry = localMeta.find((meta) => meta?.key === key);
		if (!localEntry) continue;
		const index = serverMeta.findIndex((meta) => meta?.key === key);
		if (index === -1) {
			if (source === 'mutation') serverMeta.splice(localMeta.indexOf(localEntry), 0, localEntry);
			else serverMeta.push(localEntry);
			continue;
		}
		// Editor identity changes win; server adoption retains the resident identity.
		// Money ownership is one-way at either boundary.
		const incoming = serverMeta[index];
		const moneyOwner = key === '_wcpos_money_owner_hint' || key === '_wcpos_money_owner';
		const takeIncoming = moneyOwner
			? incoming?.value === 'server' ||
				(localEntry.value !== 'server' && source === 'mutation' && incoming?.value != null)
			: source === 'mutation' && incoming?.value != null;
		const winner = takeIncoming ? incoming : localEntry;
		// A Woo-assigned id is kept whichever value wins: a resident entry written before
		// its acknowledgement has none, and a later full meta save without the id would
		// make Woo append a duplicate row.
		serverMeta[index] = { ...winner, id: winner.id ?? localEntry.id ?? incoming?.id };
	}
	return serverMeta;
}
