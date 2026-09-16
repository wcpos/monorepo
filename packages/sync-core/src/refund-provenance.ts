import type { MetaDataEntry } from './pos-carrier/carrier';

/** POS provenance is broader than session attribution: Pro also stamps user/store. */
export function hasPosRefundStamp(
	metaData: readonly MetaDataEntry[] | undefined,
	scope?: { storeId?: string | number }
): boolean {
	const storeId = String(scope?.storeId ?? '').trim();
	if (
		storeId &&
		metaData?.some(
			({ key, value }) =>
				key === '_pos_store' &&
				(typeof value === 'string' || typeof value === 'number') &&
				String(value) !== storeId
		)
	)
		return false;
	return (
		metaData?.some(
			({ key }) =>
				key === '_wcpos_session' ||
				key === '_wcpos_register' ||
				key === '_pos_user' ||
				key === '_pos_store'
		) ?? false
	);
}
