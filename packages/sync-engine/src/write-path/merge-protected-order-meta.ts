import { type MetaDataEntry, POS_META_KEYS } from '@wcpos/sync-core';

/** POS identity and money-ownership metadata whose resident values survive server adoption. */
export const POS_ORDER_IDENTITY_META_KEYS = [
	POS_META_KEYS.user,
	POS_META_KEYS.store,
	POS_META_KEYS.taxBasedOn,
	'_wcpos_money_owner_hint',
] as const;

export function mergeProtectedOrderMeta(localMeta: MetaDataEntry[], incomingMeta: MetaDataEntry[]) {
	const serverMeta = [...incomingMeta];
	for (const key of POS_ORDER_IDENTITY_META_KEYS) {
		const localEntry = localMeta.find((meta) => meta?.key === key);
		if (!localEntry) continue;
		const index = serverMeta.findIndex((meta) => meta?.key === key);
		if (index === -1) {
			serverMeta.push(localEntry);
			continue;
		}
		// The money-owner hint is one-way: `server` is the only value that means anything
		// and it is never un-set by a till, so an incoming `server` beats a local
		// tombstone or stale value (another till's older meta edit) instead of being
		// masked by it. Everything else keeps the local value.
		const incoming = serverMeta[index];
		const winner =
			key === '_wcpos_money_owner_hint' &&
			incoming?.value === 'server' &&
			localEntry.value !== 'server'
				? incoming
				: localEntry;
		// A Woo-assigned id is kept whichever value wins: a resident entry written before
		// its acknowledgement has none, and a later full meta save without the id would
		// make Woo append a duplicate row.
		serverMeta[index] = { ...winner, id: winner.id ?? localEntry.id ?? incoming?.id };
	}
	return serverMeta;
}
