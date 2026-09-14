import type { UserDatabase } from '@wcpos/database';
import type { MetaDataEntry } from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';

import { readBoundRegister } from '../../../../../services/register/register-document';

const logger = getLogger(['wcpos', 'pos', 'checkout']);

/**
 * Written when a sale has COMPLETED without a store register on it, never before: the
 * tuple is stamped ahead of the final leg, and a declined leg must not leave a row
 * claiming a sale was recorded. Every device mints its own register and the store
 * seeds a default one, so this is a store register not bound (several and none
 * chosen, or an admin removed them all) or one bound in another store of the site.
 * The device's counter is on the order either way.
 */
export async function reportProvenanceGap(input: {
	userDB: UserDatabase;
	siteUuid: string;
	storeId?: number;
	order: { id?: number | null; uuid: string; meta_data?: MetaDataEntry[] | null };
}): Promise<void> {
	const { order } = input;
	if ((order.meta_data ?? []).some(({ key }) => key === '_wcpos_register')) return;
	const bound = await readBoundRegister(input.userDB, input.siteUuid, input.storeId).catch(
		() => null
	);
	logger.warn('Sale recorded without register provenance', {
		context: {
			type: 'checkout.provenance-skipped',
			reason: bound ? 'register_bound_elsewhere' : 'no_register_bound',
			// Truthiness is deliberate: an order the store has not seen yet carries `id: 0`.
			...(order.id ? { orderId: order.id } : {}),
			orderUUID: order.uuid,
			// Part of the repeat-collapse identity, so two such sales stay two rows.
			recordId: order.uuid,
			storeId: input.storeId ?? null,
		},
	});
}
