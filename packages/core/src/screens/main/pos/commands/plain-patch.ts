import type { useQueryRuntime } from '@wcpos/query';
import {
	applyLocalPatch,
	type MutationDocument,
	type PayloadChanges,
	ResidentWriteError,
} from '@wcpos/query/mutations';
import { getCurrentBoundRegisterId } from '@wcpos/query/register-session';
export { findEngineResident } from '@wcpos/query/mutations';

export async function plainPatch<TDocument extends MutationDocument>(
	manager: ReturnType<typeof useQueryRuntime>,
	collectionName: string | undefined,
	input: { document: TDocument; changes: PayloadChanges }
) {
	try {
		return await applyLocalPatch(manager, input, {
			collectionName,
			registerId: getCurrentBoundRegisterId() ?? undefined,
		});
	} catch (error) {
		throw error instanceof ResidentWriteError ? error.cause : error;
	}
}
