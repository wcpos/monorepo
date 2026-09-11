import type { UserDatabase } from '@wcpos/database';
import {
	hasSaleProvenance,
	type MetaDataEntry,
	saleProvenanceMeta,
	withSaleProvenance,
} from '@wcpos/order-math';
import { AppInfo } from '@wcpos/utils/app-info';

import { nextSaleCounter, readRegister } from '../../../../../services/register/register-document';

export async function completionMeta(
	order: { meta_data?: MetaDataEntry[] },
	{ userDB, siteUuid }: { userDB: UserDatabase; siteUuid: string }
): Promise<MetaDataEntry[]> {
	if (hasSaleProvenance(order.meta_data)) return order.meta_data!;
	const register = await readRegister(userDB);
	if (!register) return order.meta_data ?? [];
	const counter = await nextSaleCounter(userDB, siteUuid);
	return withSaleProvenance(
		order.meta_data,
		saleProvenanceMeta({
			registerId: register.sites[siteUuid]?.register_id ?? '',
			saleCounter: counter,
			now: new Date(),
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
			appVersion: AppInfo.version,
			appBuild: AppInfo.buildNumber,
			sessionId: null,
		}).filter(({ key, value }) => key !== '_wcpos_register' || !!value)
	);
}
