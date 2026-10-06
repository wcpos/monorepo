import * as React from 'react';

import { of } from 'rxjs';

import { ProductsFooter } from '../footer';
import { useAnswerOf } from './use-answer-of';

import type { useRelationalCollectionBinding } from '../../../../../../query';

type Binding = ReturnType<typeof useRelationalCollectionBinding>;

/**
 * The till's footer under a term set (the root grid's and the root table's): the catalogue
 * total, the tax basis line and the sync button, unchanged. The loaded window means nothing over
 * terms, so the count is the total; with no total to vouch for one (`QueryBinding.total$`), the
 * loaded rows are all there is. Both are attributed to the query now asked (`useAnswerOf`): on a
 * return to the root the level's total is not the catalogue's, and is never shown as it. The
 * footer is handed that attributed total too, as a stream of its own (as the term levels'
 * footers are): it reads `total$` as state, which keeps a replaced stream's last value.
 */
export function BrowseRootFooter({ binding }: { binding: Binding }) {
	const { total$, result$ } = binding;
	const total = useAnswerOf(total$) ?? null;
	const loaded = useAnswerOf(result$)?.hits.length ?? 0;
	const attributedTotal$ = React.useMemo(() => of(total), [total]);
	return (
		<ProductsFooter
			collectionName="products"
			active$={binding.active$}
			total$={attributedTotal$}
			sync={binding.sync}
			count={total ?? loaded}
		/>
	);
}
