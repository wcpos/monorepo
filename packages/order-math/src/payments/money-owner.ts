import type { MetaDataEntry } from './ledger';

/**
 * Whether the server owns this order's line-money aggregate (ADR 0032): the till wrote the
 * durable hint after the store overruled its arithmetic. Not ADR 0040's payment authority, so
 * no payments contract enters it.
 */
export function serverOwnsMoney(meta: readonly MetaDataEntry[] | null | undefined): boolean {
	return (
		meta?.some(({ key, value }) => key === '_wcpos_money_owner_hint' && value === 'server') ?? false
	);
}
