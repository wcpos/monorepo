import { categoryChain, chainLabel } from '../margin';

import type { LocalProduct } from '../cards/aggregate';
import type { CategoryTree } from '../margin';

export function categoryChoices(
	products: LocalProduct[],
	tree: CategoryTree,
	separator: string,
	unknown: string
): { value: string; label: string }[] {
	const ids = new Set<number>();
	// The product carries its category's name: a category the local tree has not cached (an
	// empty local read passes the panel's readiness gate) still labels its row, never a blank one.
	const embedded = new Map<number, string>();
	for (const product of products) {
		const category = product.categories?.[0];
		if (category?.id == null) continue;
		ids.add(category.id);
		if (category.name) embedded.set(category.id, category.name);
		for (const node of categoryChain(category.id, tree)) ids.add(node.id);
	}
	return [...ids]
		.map((id) => ({
			value: String(id),
			label: chainLabel(id, tree, separator, unknown) || embedded.get(id) || unknown,
		}))
		.sort((a, b) => a.label.localeCompare(b.label));
}
export function brandChoices(products: LocalProduct[]): { value: string; label: string }[] {
	const choices = new Map<string, string>();
	for (const product of products) {
		const brand = product.brands?.[0];
		if (brand?.id != null) choices.set(String(brand.id), brand.name ?? '');
	}
	return [...choices]
		.map(([value, label]) => ({ value, label }))
		.sort((a, b) => a.label.localeCompare(b.label));
}
export function filterLines<T extends { line_items?: { product_id?: number | null }[] | null }>(
	rows: T[],
	products: LocalProduct[],
	tree: CategoryTree,
	{ categoryId, brandId }: { categoryId?: string; brandId?: string }
): T[] {
	if (categoryId === undefined && brandId === undefined) return rows;
	const directory = new Map(products.map((product) => [product.id, product]));
	return rows.map((row) => ({
		...row,
		line_items: (row.line_items ?? []).filter((line) => {
			const product = directory.get(line.product_id ?? undefined);
			if (!product) return false;
			const category = product.categories?.[0]?.id;
			return (
				(categoryId === undefined ||
					(category != null &&
						(String(category) === categoryId ||
							categoryChain(category, tree).some((node) => String(node.id) === categoryId)))) &&
				(brandId === undefined || String(product.brands?.[0]?.id) === brandId)
			);
		}),
	}));
}
