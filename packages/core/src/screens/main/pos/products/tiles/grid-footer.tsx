import * as React from 'react';
import { View } from 'react-native';

import { Loader } from '@wcpos/components/loader';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';
import { usePagingVerdict } from '../../../../../query';

import type { EngineOpinion } from '../../../../../query';

interface ProductGridFooterProps {
	/** The handle snapshot's `pending` and `exhausted`, as the grid holds them. */
	engine: EngineOpinion;
	/** Rendered product rows — the footer says nothing under an empty grid. */
	renderedCount: number;
	/** Local query hits before stale-hit suppression, matching the paging guard. */
	hitCount: number;
	/** Residents are still below the unnarrowed place's count. */
	short: boolean;
}

export function GridLoadingRow() {
	return (
		<View className="items-center justify-center p-3" testID="pos-products-grid-loading">
			<Loader />
		</View>
	);
}

/**
 * The row under the last tile, so blank space under a short page is never ambiguous.
 *
 * Ten tiles rarely fill a wide panel, and a cashier reading blank space below them concluded
 * the catalogue ended there — while the next page was one scroll away, or was being fetched
 * (2026-08-30). Two states, nothing else: a spinner while an extension is outstanding, and a
 * plain "no more products" after a settled short local read unless the place is still short
 * (loading) or the engine says more may exist. A full local read is never terminal, matching
 * the paging guard.
 */
export function ProductGridFooter({
	engine,
	renderedCount,
	hitCount,
	short,
}: ProductGridFooterProps) {
	const t = useT();
	const { verdict } = usePagingVerdict(hitCount, engine);

	if (renderedCount === 0) return null;
	if (engine.pending) return <GridLoadingRow />;
	if (verdict !== 'end') return null;
	if (short) return <GridLoadingRow />;
	return (
		<View className="items-center justify-center p-3" testID="pos-products-grid-end">
			<Text className="text-muted-foreground text-sm">{t('pos_products.no_more_products')}</Text>
		</View>
	);
}
