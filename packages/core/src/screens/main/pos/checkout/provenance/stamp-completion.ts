import type { UserDatabase } from '@wcpos/query/user-db';
import {
	hasSaleProvenance,
	hasSaleTime,
	type MetaDataEntry,
	readLedger,
	saleProvenanceMeta,
	withSaleProvenance,
} from '@wcpos/order-math';
import { AppInfo } from '@wcpos/utils/app-info';
import { boundRegisterIdOf, nextSaleCounter, readRegister } from '@wcpos/query/register-session';

export async function completionMeta(
	order: { id?: number | null; uuid?: string; meta_data?: MetaDataEntry[] },
	{
		userDB,
		siteUuid,
		storeId,
		sessionId,
	}: { userDB: UserDatabase; siteUuid: string; storeId?: number; sessionId?: string | null }
): Promise<MetaDataEntry[]> {
	if (hasSaleProvenance(order.meta_data)) return order.meta_data!;
	const register = await readRegister(userDB);
	const stamp = (registerId: string | null, saleCounter: number | null) =>
		withSaleProvenance(
			order.meta_data,
			saleProvenanceMeta({
				registerId,
				saleCounter,
				now: new Date(),
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
				appVersion: AppInfo.version,
				appBuild: AppInfo.buildNumber,
				sessionId:
					sessionId ??
					readLedger(order.meta_data).findLast((row) => row.status === 'captured' && row.session_id)
						?.session_id ??
					null,
			})
		);
	if (!register) {
		// Every device mints its register document during hydration, so this is a till
		// that has not finished hydrating. Stamp what is known and leave the register and
		// the counter empty rather than invent them; a sale already carrying the partial
		// tuple is left alone.
		if (hasSaleTime(order.meta_data)) return order.meta_data!;
		return stamp(null, null);
	}
	const counter = await nextSaleCounter(userDB, siteUuid);
	// A register belongs to one store: this store's binding, never another store's of the site.
	// The store seeds a default register and a till binds to a lone register on its own,
	// so a sale reaches here unbound only when the store has several registers and none
	// was chosen (checkout refuses to complete in that state) or an admin removed them
	// all. The counter is the device's and is stamped regardless; the gap is reported
	// when the sale actually completes (see provenance-gap.ts), not here.
	return stamp(boundRegisterIdOf(register, siteUuid, storeId), counter);
}
