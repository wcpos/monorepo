import { sortAliasFor, wooOrderbyFor } from '@wcpos/query';
import type { ProductBrowseDimensions } from '@wcpos/sync-engine';

import initialSettings from './initial-settings.json';

export type DefaultProductBrowseSort = {
	orderby: NonNullable<ProductBrowseDimensions['orderby']>;
	order: 'asc' | 'desc';
};

/**
 * The ONE authored product default sort, translated to its wire spelling for
 * the engine's pre-grid work (the boot browse-window seed and the idle
 * trickle's fallback). Paul's ruling 2026-08-19: initial-settings.json is the
 * single place the default lives — the POS screen's invalid-sort fallback and
 * the engine's cold-start window both DERIVE from it, so the boot pull, the
 * trickle and a fresh grid can never disagree about the catalog order again.
 *
 * Returns undefined when the authored default has no wire orderby (a
 * local-only sort like `type`): the engine then falls back to its canonical
 * key spelling, exactly as a grid declaring that sort would.
 */
export function defaultProductBrowseSort(): DefaultProductBrowseSort | undefined {
	const { sortBy, sortDirection } = initialSettings['pos-products'];
	// Inline normalizeQuerySortField's products arm (alias ?? field) — importing
	// the translator would drag core's React-side graph into the host's module
	// scope, which jest-expo's winter runtime refuses (the #1376 CI failure).
	const orderby = wooOrderbyFor('products', sortAliasFor('products', sortBy) ?? sortBy);
	if (!orderby) return undefined;
	return { orderby, order: sortDirection === 'desc' ? 'desc' : 'asc' };
}
