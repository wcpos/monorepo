export const BROWSE_BY = ['all', 'categories', 'tags', 'brands', 'shortcuts'] as const;
export type BrowseBy = (typeof BROWSE_BY)[number];
export type TaxonomySource = 'categories' | 'tags' | 'brands';

/**
 * What a till browses by until the cashier chooses: categories (owner, 2026-10-07). The seed in
 * `ui-settings/initial-settings.json` carries the same literal; a test keeps the two together.
 */
export const DEFAULT_BROWSE_BY: BrowseBy = 'categories';

/** A persisted value the app does not know (a newer build wrote it) reads as the default. */
export function readBrowseBy(value: unknown): BrowseBy {
	return (BROWSE_BY as readonly unknown[]).includes(value)
		? (value as BrowseBy)
		: DEFAULT_BROWSE_BY;
}

export function isTaxonomy(source: BrowseBy): source is TaxonomySource {
	return source === 'categories' || source === 'tags' || source === 'brands';
}

/** WooCommerce registers product_cat and product_brand as hierarchical; product_tag is flat. */
export function isHierarchical(source: TaxonomySource): boolean {
	return source !== 'tags';
}

export function collectionFor(
	source: TaxonomySource
): 'products/categories' | 'products/tags' | 'products/brands' {
	return `products/${source}`;
}

export type BrowseTerm =
	| { kind: 'all' }
	| {
			kind: 'term';
			id: number;
			name: string;
			count: number;
			imageSrc?: string;
			display?: string;
			parent?: number;
	  }
	| { kind: 'shortcut'; id: string; name: string; description: string };

export function termKey(term: BrowseTerm): string {
	if (term.kind === 'all') return 'all';
	if (term.kind === 'term') return `term-${term.id}`;
	return `shortcut-${term.id}`;
}
