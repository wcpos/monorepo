import { type MetaDataEntry, withMetaReplaced } from '@wcpos/order-math';
import type { UserDatabase } from '@wcpos/database';
import type { EngineRecord } from '@wcpos/query';

import { completionMeta } from './stamp-completion';

import type { usePushDocument } from '../../../contexts/use-push-document';
import type { useLocalMutation } from '../../../hooks/mutations/use-local-mutation';

export async function persistProvenance(input: {
	order: EngineRecord<'orders'>;
	localPatch: ReturnType<typeof useLocalMutation>['localPatch'];
	pushDocument: ReturnType<typeof usePushDocument>;
	userDB: UserDatabase;
	siteUuid: string;
	sessionId?: string | null;
	extraMeta?: MetaDataEntry[];
}): Promise<void> {
	const { order, localPatch, pushDocument, userDB, siteUuid, sessionId } = input;
	const meta = await completionMeta(order.getLatest().payload, { userDB, siteUuid, sessionId });
	const patched = await localPatch({
		document: order,
		// Replace, not keep: these describe the sale as it is completing now, and an
		// earlier failed attempt at the final leg may have written a different plan.
		data: { meta_data: withMetaReplaced(meta, input.extraMeta ?? []) },
	});
	if (!patched) throw new Error('provenance_save_failed');
	await pushDocument(order);
}
