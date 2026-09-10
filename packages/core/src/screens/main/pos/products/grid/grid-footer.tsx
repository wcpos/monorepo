import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import { Loader } from '@wcpos/components/loader';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';
import { useQueryState } from '../../../../../query';

import type { QueryBinding } from '../../../../../query';

const selectLimit = (state: { limit: number }): number => state.limit;

interface ProductGridFooterProps {
	binding: Pick<QueryBinding, 'pending$' | 'exhausted$'>;
	/** Rendered product rows — the footer says nothing under an empty grid. */
	count: number;
}

/**
 * The row under the last tile, so blank space under a short page is never ambiguous.
 *
 * Ten tiles rarely fill a wide panel, and a cashier reading blank space below them concluded
 * the catalogue ended there — while the next page was one scroll away, or was being fetched
 * (2026-08-30). Two states, nothing else: a spinner while an extension is outstanding, and a
 * plain "no more products" once the engine says the search is exhausted (or, where it has no
 * opinion — a browse window — once the page came back short, the same rule the paging guard
 * uses). The footer's "Showing X of Y" is untouched: Y is the store's census by ruling.
 */
export function ProductGridFooter({ binding, count }: ProductGridFooterProps) {
	const t = useT();
	const limit = useQueryState(selectLimit);
	const { pending$, exhausted$ } = binding;
	const pending = useObservableState(pending$, false);
	const exhausted = useObservableState(exhausted$, null);

	// The rendered-row count as its own referent, the grid's twin of the data-table footer's
	// `data-table-loaded-count`: the grid virtualizes its tiles, so counting tiles in a test reads
	// the viewport, not the result. Its own testID, because the E2E catalogue-readiness check
	// locates the table's in strict mode. Hidden, like the table's; E2E reads its text.
	const loadedCount = (
		<Text testID="pos-products-grid-loaded-count" className="hidden">
			{count}
		</Text>
	);
	if (count === 0) return loadedCount;
	if (pending) {
		return (
			<>
				{loadedCount}
				<View className="items-center justify-center p-3" testID="pos-products-grid-loading">
					<Loader />
				</View>
			</>
		);
	}
	const atEnd = exhausted === true || (exhausted === null && count < limit);
	if (!atEnd) return loadedCount;
	return (
		<>
			{loadedCount}
			<View className="items-center justify-center p-3" testID="pos-products-grid-end">
				<Text className="text-muted-foreground text-sm">{t('pos_products.no_more_products')}</Text>
			</View>
		</>
	);
}
