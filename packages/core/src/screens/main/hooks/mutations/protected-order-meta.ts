import { type MetaDataEntry, PROTECTED_ORDER_META_KEYS } from '@wcpos/sync-core';

/** Missing entries and deletion tombstones cannot erase protected order metadata. */
export function protectOrderMeta(
	current: Record<string, unknown>,
	changes: Record<string, unknown>
) {
	if (!Array.isArray(changes.meta_data)) return changes;
	const meta: MetaDataEntry[] = [...changes.meta_data];
	const previous: MetaDataEntry[] = Array.isArray(current.meta_data) ? current.meta_data : [];
	previous.forEach((entry, position) => {
		if (!PROTECTED_ORDER_META_KEYS.includes(entry.key ?? '')) return;
		const index = meta.findIndex((incoming) => incoming.key === entry.key);
		if (index === -1) meta.splice(position, 0, entry);
		else if (meta[index].value === null) meta[index] = entry;
	});
	return { ...changes, meta_data: meta };
}
