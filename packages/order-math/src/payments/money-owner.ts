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

/** Woo serializes integer order meta as strings; missing/invalid epochs predate 1.3. */
export function readMoneyEpoch(meta: unknown): number {
	const value = Array.isArray(meta)
		? meta.find((entry) => entry?.key === '_wcpos_money_epoch')?.value
		: undefined;
	const epoch = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
	return typeof epoch === 'number' && Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0;
}
