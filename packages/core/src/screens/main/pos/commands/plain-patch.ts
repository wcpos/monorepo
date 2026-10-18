import cloneDeep from 'lodash/cloneDeep';

import type { useQueryRuntime } from '@wcpos/query';

import {
	documentRecordId,
	type MutationDocument,
	patchAndEnqueueEngineResident,
	type PayloadChanges,
	syncableChanges,
	writeableCollection,
} from '../../hooks/mutations/use-local-mutation';
import { getCurrentBoundRegisterId } from '../../../../services/register/register-document';
import {
	getTemporaryOrder,
	patchTemporaryOrderPayload,
} from '../contexts/current-order/temporary-order';
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';

export { findEngineResident } from '../../hooks/mutations/use-local-mutation';

/** Shared pure resolver wrapper; the hook and background commands use the same write path. */
export async function plainPatch<TDocument extends MutationDocument>(
	manager: ReturnType<typeof useQueryRuntime>,
	collectionName: string | undefined,
	{ document, changes: resolveChanges }: { document: TDocument; changes: PayloadChanges }
) {
	const collection = writeableCollection(collectionName);
	const recordId = documentRecordId(document);
	if (!collection || !recordId) throw new Error('Payload changes require an engine record');
	let changes: Record<string, unknown> = {};
	const resolve: PayloadChanges = (payload) => {
		changes = cloneDeep(
			Object.fromEntries(
				Object.entries(resolveChanges(payload)).filter(([, value]) => value !== undefined)
			)
		);
		if (Object.keys(changes).length === 0) return changes;
		changes.date_modified_gmt = convertLocalDateToUTCString(new Date());
		return syncableChanges(collection, changes);
	};
	if (collection === 'orders' && (document as { isNew?: boolean }).isNew) {
		const latest = (await getTemporaryOrder(recordId))?.getLatest();
		if (latest && Object.keys(resolve(latest.payload as Record<string, unknown>)).length === 0)
			return { changes, document: latest as TDocument };
	}
	const patched =
		collection === 'orders' && (document as { isNew?: boolean }).isNew
			? await patchTemporaryOrderPayload(recordId, resolve)
			: await patchAndEnqueueEngineResident({
					manager,
					collection,
					recordId,
					changes: resolve,
					registerId: getCurrentBoundRegisterId() ?? undefined,
				});
	if (!patched) throw new Error('Temporary order is missing from the temporary DB');
	return { changes, document: patched as TDocument };
}
