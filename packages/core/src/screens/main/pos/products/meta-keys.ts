interface MetaDataEntry {
	key?: string;
	value?: string;
}

export interface MetaProduct {
	meta_data?: MetaDataEntry[];
}

/**
 * Aggregate distinct, sorted meta_data keys from a list of products.
 *
 * Kept in its own import-light module so it can be unit-tested without pulling
 * in the RxDB / native dependency chain that `use-product-meta-keys` requires.
 */
export function collectMetaKeys(products: MetaProduct[]): string[] {
	const keys = new Set<string>();
	for (const product of products) {
		const meta = Array.isArray(product?.meta_data) ? product.meta_data : [];
		for (const entry of meta) {
			if (entry?.key) {
				keys.add(entry.key);
			}
		}
	}
	return Array.from(keys).sort((a, b) => a.localeCompare(b));
}
