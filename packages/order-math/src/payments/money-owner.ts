import type { MetaDataEntry } from './ledger';

/** The protected server stamp, or the durable client hint used before contract 1.3. */
export function serverOwnsMoney(meta: readonly MetaDataEntry[] | null | undefined): boolean {
	return (
		meta?.some(
			({ key, value }) =>
				(key === '_wcpos_money_owner' || key === '_wcpos_money_owner_hint') && value === 'server'
		) ?? false
	);
}
