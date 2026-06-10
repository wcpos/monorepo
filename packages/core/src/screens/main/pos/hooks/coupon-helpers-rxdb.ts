import { enrichCategoriesWithAncestors } from './coupon-helpers';

/**
 * Build an ancestor-enriched product categories map from RxDB collections.
 * Shared by use-recalculate-coupons and use-add-coupon to avoid duplication.
 */
export async function buildEnrichedProductCategories(
	productCategories: Map<number, { id: number }[]>,
	categoryCollection: { find: () => { exec: () => Promise<any[]> } }
): Promise<Map<number, { id: number }[]>> {
	const allCategoryDocs = await categoryCollection.find().exec();
	const categoryParentMap = new Map<number, number>();
	for (const doc of allCategoryDocs) {
		if (doc.id != null && doc.parent != null) {
			categoryParentMap.set(doc.id as number, doc.parent as number);
		}
	}
	return enrichCategoriesWithAncestors(productCategories, categoryParentMap);
}
