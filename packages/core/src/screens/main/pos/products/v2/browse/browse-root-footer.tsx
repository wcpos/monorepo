import * as React from 'react';

import { of } from 'rxjs';

import { ProductsFooter } from '../footer';
import { useAnswerOf } from './use-answer-of';

import type { useRelationalCollectionBinding } from '../../../../../../query';

type Binding = ReturnType<typeof useRelationalCollectionBinding>;

type Shown = { count: number; total: number | null };

/**
 * The till's footer under a term set (the root grid's and the root table's): the catalogue
 * total, the tax basis line and the sync button, unchanged. The loaded window means nothing over
 * terms, so the count is the total; with no total to vouch for one (`QueryBinding.total$`), the
 * loaded rows are all there is. Both are attributed to the query now asked (`useAnswerOf`): on a
 * return to the root the level's total is not the catalogue's, and is never shown as it. The
 * footer is handed that attributed total too, as a stream of its own (as the term levels'
 * footers are): it reads `total$` as state, which keeps a replaced stream's last value.
 *
 * Held, as a level holds its snapshot (level-snapshot.ts): new numbers are taken only while the
 * root is `settled` (no path: its query is the root's) and both have answered. While a level
 * covers the root, or the root's query is being re-asked (a cold entry, a return gathering), the
 * last root numbers stay — never a "Showing 0" flash, never a level's count.
 */
export function BrowseRootFooter({
	binding,
	settled = true,
}: {
	binding: Binding;
	/** The stage's path is empty: the shared query is the root's own. */
	settled?: boolean;
}) {
	const { total$, result$ } = binding;
	const liveTotal = useAnswerOf(total$);
	const liveResult = useAnswerOf(result$);
	const live: Shown | undefined =
		settled && liveResult !== undefined && liveTotal !== undefined
			? { count: liveTotal ?? liveResult.hits.length, total: liveTotal }
			: undefined;
	// The last root numbers (React's "previous render" pattern: settles in one pass).
	const [held, setHeld] = React.useState<Shown>();
	if (live && (held?.count !== live.count || held.total !== live.total)) setHeld(live);
	const shown = live ?? held ?? { count: liveResult?.hits.length ?? 0, total: null };
	const { total, count } = shown;
	const attributedTotal$ = React.useMemo(() => of(total), [total]);
	return (
		<ProductsFooter
			collectionName="products"
			active$={binding.active$}
			total$={attributedTotal$}
			sync={binding.sync}
			count={count}
		/>
	);
}
