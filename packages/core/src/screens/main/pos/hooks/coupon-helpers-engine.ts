import type { EngineRecord } from '@wcpos/query';
import { wooIdOf } from '@wcpos/sync-core';

/** Build settle's raw category_id -> parent_id map from engine-backed adapter proxies. */
export function buildCategoryParents(
	categoryDocuments: EngineRecord<'categories'>[]
): Map<number, number> {
	const categoryParentMap = new Map<number, number>();
	for (const document of categoryDocuments) {
		if (document.remoteId !== null && document.payload.parent != null) {
			categoryParentMap.set(wooIdOf(document.remoteId), document.payload.parent);
		}
	}
	return categoryParentMap;
}
