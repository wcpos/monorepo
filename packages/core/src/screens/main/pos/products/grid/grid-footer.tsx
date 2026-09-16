import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import { Loader } from '@wcpos/components/loader';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';
import { getPagingVerdict, useQueryState } from '../../../../../query';

import type { QueryBinding } from '../../../../../query';

const selectLimit = (state: { limit: number }): number => state.limit;

interface ProductGridFooterProps {
	binding: Pick<QueryBinding, 'pending$' | 'exhausted$'>;
	/** Rendered product rows — the footer says nothing under an empty grid. */
	count: number;
	/** Local query hits before stale-hit suppression, matching the paging guard. */
	resultCount: number;
}

/**
 * The row under the last tile, so blank space under a short page is never ambiguous.
 *
 * Ten tiles rarely fill a wide panel, and a cashier reading blank space below them concluded
 * the catalogue ended there — while the next page was one scroll away, or was being fetched
 * (2026-08-30). Two states, nothing else: a spinner while an extension is outstanding, and a
 * plain "no more products" after a settled short local read unless the engine says more may
 * exist. A full local read is never terminal, matching the paging guard. The footer's
 * "Showing X of Y" is untouched: Y is the store's census by ruling.
 */
export function ProductGridFooter({ binding, count, resultCount }: ProductGridFooterProps) {
	const t = useT();
	const limit = useQueryState(selectLimit);
	const { pending$, exhausted$ } = binding;
	const pending = useObservableState(pending$, false);
	const exhausted = useObservableState(exhausted$, null);
	const { atEnd, reason } = getPagingVerdict(resultCount, limit, pending, exhausted);

	if (count === 0) return null;
	if (reason === 'pending') {
		return (
			<View className="items-center justify-center p-3" testID="pos-products-grid-loading">
				<Loader />
			</View>
		);
	}
	if (!atEnd) return null;
	return (
		<View className="items-center justify-center p-3" testID="pos-products-grid-end">
			<Text className="text-muted-foreground text-sm">{t('pos_products.no_more_products')}</Text>
		</View>
	);
}
