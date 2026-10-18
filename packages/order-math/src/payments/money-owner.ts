import { paymentsContractAtLeast } from './contract';

import type { MetaDataEntry } from './ledger';

/** At 1.3 only the server stamp owns money; older/unknown stores also honor the durable hint. */
export function serverOwnsMoney(
	meta: readonly MetaDataEntry[] | null | undefined,
	{ storeContract }: { storeContract?: string | null } = {}
): boolean {
	return (
		meta?.some(
			({ key, value }) =>
				(key === '_wcpos_money_owner' ||
					(key === '_wcpos_money_owner_hint' && !paymentsContractAtLeast(storeContract, '1.3'))) &&
				value === 'server'
		) ?? false
	);
}

export { readMoneyEpoch } from '@wcpos/sync-core';
