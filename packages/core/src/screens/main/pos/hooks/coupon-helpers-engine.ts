import { enrichCategoriesWithAncestors } from '@wcpos/order-math/internal';

/** Build an ancestor-enriched product category map from engine-backed adapter proxies. */
export function buildEnrichedProductCategories(
	productCategories: Map<number, { id: number }[]>,
	categoryDocuments: import('@wcpos/database').ProductCategoryDocument[]
): Map<number, { id: number }[]> {
	const categoryParentMap = new Map<number, number>();
	for (const document of categoryDocuments) {
		if (document.id != null && document.parent != null) {
			categoryParentMap.set(document.id, document.parent);
		}
	}
	return enrichCategoriesWithAncestors(productCategories, categoryParentMap);
}
