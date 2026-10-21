import {
	type MetaDataEntry,
	POS_META_KEYS,
	PROTECTED_ORDER_META_KEYS,
	SERVER_ORDER_MONEY_META_KEYS,
} from '@wcpos/sync-core';

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
	let serverMeta = [...incomingMeta];
	const keys = source === 'mutation' ? PROTECTED_ORDER_META_KEYS : POS_ORDER_IDENTITY_META_KEYS;
	for (const key of keys) {
		const localRows = localMeta.filter((meta) => meta?.key === key);
		const incomingRows = serverMeta.filter((meta) => meta?.key === key);
		const localEntry = localRows.find((meta) => meta.id != null) ?? localRows[0];
		const incoming =
			incomingRows.find((meta) => meta.id != null && meta.id === localEntry?.id) ??
			incomingRows.find((meta) => meta.id != null) ??
			incomingRows[0];
		if (!localEntry && !incoming) continue;
		const index = incoming
			? serverMeta.slice(0, serverMeta.indexOf(incoming)).filter((meta) => meta?.key !== key).length
			: source === 'mutation'
				? localMeta.indexOf(localEntry)
				: serverMeta.length;
		serverMeta = serverMeta.filter((meta) => meta?.key !== key);

		if (SERVER_ORDER_MONEY_META_KEYS.includes(key)) {
			if (localEntry) serverMeta.splice(index, 0, localEntry);
			continue;
		}

		// Editor identity changes win; server adoption retains the resident identity.
		// Money ownership is one-way at either boundary.
		const moneyOwner = key === '_wcpos_money_owner_hint';
		const takeIncoming = moneyOwner
			? incoming?.value === 'server' ||
				(localEntry?.value !== 'server' && source === 'mutation' && incoming?.value != null)
			: source === 'mutation' && incoming?.value != null;
		const winner = (takeIncoming ? incoming : localEntry) ?? incoming!;
		// A Woo-assigned id is kept whichever value wins: a resident entry written before
		// its acknowledgement has none, and a later full meta save without the id would
		// make Woo append a duplicate row.
		serverMeta.splice(index, 0, {
			...winner,
			...(moneyOwner && [...localRows, ...incomingRows].some((meta) => meta.value === 'server')
				? { value: 'server' }
				: {}),
			id: winner.id ?? localEntry?.id ?? incoming?.id,
		});
	}
	return serverMeta;
}
