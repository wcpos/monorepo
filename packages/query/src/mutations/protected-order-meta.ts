import { type MetaDataEntry } from '@wcpos/sync-core';
import { mergeProtectedOrderMeta } from '@wcpos/sync-engine';

/** Missing entries and deletion tombstones cannot erase protected order metadata. */
export function protectOrderMeta(
	current: Record<string, unknown>,
	changes: Record<string, unknown>
) {
	if (!Array.isArray(changes.meta_data)) return changes;
	const meta: MetaDataEntry[] = [...changes.meta_data];
	const previous: MetaDataEntry[] = Array.isArray(current.meta_data) ? current.meta_data : [];
	return { ...changes, meta_data: mergeProtectedOrderMeta(previous, meta, 'mutation') };
}
