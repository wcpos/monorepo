import type { useQueryRuntime } from '@wcpos/query';
import {
	applyLocalPatch,
	type PayloadChanges,
	ResidentWriteError,
	type WriteTarget,
} from '@wcpos/query/mutations';
import { getCurrentBoundRegisterId } from '@wcpos/query/register-session';
export { findEngineResident } from '@wcpos/query/mutations';

/** The order-only resolver write: the changes are resolved against the resident inside the door. */
export async function writeOrderChanges<TDocument extends WriteTarget>(
	manager: ReturnType<typeof useQueryRuntime>,
	input: { document: TDocument; changes: PayloadChanges }
) {
	try {
		return await applyLocalPatch(manager, input, {
			collectionName: 'orders',
			registerId: getCurrentBoundRegisterId() ?? undefined,
		});
	} catch (error) {
		throw error instanceof ResidentWriteError ? error.cause : error;
	}
}
