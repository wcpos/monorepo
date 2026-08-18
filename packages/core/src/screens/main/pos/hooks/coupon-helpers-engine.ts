import { enrichCategoriesWithAncestors } from '@wcpos/order-math/internal';
import type { EngineRecord } from '@wcpos/query';
import { wooIdOf } from '@wcpos/sync-core';

/** Build an ancestor-enriched product category map from engine-backed adapter proxies. */
export function buildEnrichedProductCategories(
	productCategories: Map<number, { id: number }[]>,
	categoryDocuments: EngineRecord<'categories'>[]
): Map<number, { id: number }[]> {
	const categoryParentMap = new Map<number, number>();
	for (const document of categoryDocuments) {
		if (document.remoteId !== null && document.payload.parent != null) {
			categoryParentMap.set(wooIdOf(document.remoteId), document.payload.parent);
		}
	}
	return enrichCategoriesWithAncestors(productCategories, categoryParentMap);
}
