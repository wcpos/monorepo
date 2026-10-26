import * as React from 'react';

import type { QueryHandle } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { useQueryHandleFields } from '../../../../../query';
import { HandleProductsFooter } from '../handle-footer';

import type { SnapshotFields } from '../../../../../query';
import type { BrowseBy } from './browse-source';

type Shown = { drawn: number; total: number | null };
// Literal keys: the extractor skips a template key (scripts/extract-js-strings.js).
const TERMS_KEY = {
	categories: 'pos_products.n_categories',
	tags: 'pos_products.n_tags',
	brands: 'pos_products.n_brands',
} as const;
const TOTAL_FIELD: SnapshotFields = ['total'];

/**
 * The till's footer under a term set (the root grid's and the root table's): the catalogue
 * total, the tax basis line and the sync button, unchanged. The loaded window means nothing over
 * terms, so the count is the total; with no total to vouch for one (the snapshot's `total`), the
 * loaded rows are all there is. Both are attributed to the query now asked: a snapshot belongs to
 * its handle, and the handle is the query's — on a return to the root the level's total is not
 * the catalogue's, and is never shown as it. The footer is handed the attributed total as a
 * value in the same commit as the count, never one commit late.
 *
 * Held, as a level holds its snapshot (level-snapshot.ts): new numbers are taken only while the
 * root is `settled` (no path: its query is the root's) and the handle has answered. While a
 * level covers the root, or the root's query is being re-asked (a cold entry, a return
 * gathering), the last root numbers stay — never a "Showing 0" flash, never a level's count.
 */
export function BrowseRootFooter({
	handle,
	settled = true,
	source,
	termCount,
	narrowed,
}: {
	handle: QueryHandle;
	source: Exclude<BrowseBy, 'all'>;
	termCount: number;
	narrowed: boolean;
	/** The stage's path is empty: the shared query is the root's own. */
	settled?: boolean;
}) {
	const t = useT();
	const snapshot = useQueryHandleFields(handle, TOTAL_FIELD);
	const matches = snapshot.result.count ?? snapshot.hits.length;
	const live: Shown | undefined =
		settled && snapshot.ready
			? {
					drawn: narrowed ? matches : (snapshot.total ?? matches),
					total: snapshot.total,
				}
			: undefined;
	// The last root numbers (React's "previous render" pattern: settles in one pass).
	const [held, setHeld] = React.useState<Shown>();
	if (live && (held?.drawn !== live.drawn || held.total !== live.total)) setHeld(live);
	const shown = live ?? held ?? { drawn: snapshot.ready ? snapshot.hits.length : 0, total: null };
	const products = t('pos_products.n_products', { count: shown.drawn });
	const label =
		source === 'shortcuts'
			? products
			: t('pos_products.root_tally', {
					terms: t(TERMS_KEY[source], { count: termCount }),
					products,
				});
	return (
		<HandleProductsFooter
			handle={handle}
			total={shown.total}
			drawnCount={shown.drawn}
			label={label}
		/>
	);
}
