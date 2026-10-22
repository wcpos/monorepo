import * as React from 'react';

import { Button } from '@wcpos/components/button';
import { Skeleton } from '@wcpos/components/skeleton';
import { Suspense } from '@wcpos/components/suspense';
import { useEngineRecordByWooId } from '@wcpos/query/record-readers';

import { useT } from '../../../../../contexts/translations';
import { ChipRow } from '../../chip-row';
import { BrandsPill } from './brands-pill';
import { CategoryPill } from './category-pill';
import { FeaturedPill } from './featured-pill';
import { OnSalePill } from './on-sale-pill';
import { StockStatusPill } from './stock-status-pill';
import { TagPill } from './tag-pill';
import { useQueryState, useQueryStateActions } from '../../../../../query';

/**
 *
 */
export function FilterBar() {
	const { filters } = useQueryState<'products'>();
	const actions = useQueryStateActions<'products'>();
	const t = useT();
	const changed = Object.entries(filters).filter(([key, value]) =>
		key === 'status'
			? value !== 'publish'
			: Array.isArray(value)
				? value.length > 0
				: value !== undefined && value !== ''
	).length;
	const { selectedTagID, selectedBrandID } = useQueryState<
		'products',
		{ selectedTagID?: number; selectedBrandID?: number }
	>((state) => ({
		selectedTagID: state.filters.tags[0],
		selectedBrandID: state.filters.brands[0],
	}));
	const selectedTagResource = useEngineRecordByWooId('tags', selectedTagID ?? 0);
	const selectedBrandResource = useEngineRecordByWooId('brands', selectedBrandID ?? 0);

	/**
	 *
	 */
	return (
		<ChipRow>
			<StockStatusPill />
			<FeaturedPill />
			<OnSalePill />
			{/* A pill that reads a record answers after the row has drawn: it holds a chip's
			    frame meanwhile, so the pills beside it never shift. */}
			<Suspense fallback={<Skeleton shape="chip" />}>
				<CategoryPill />
			</Suspense>
			<Suspense fallback={<Skeleton shape="chip" />}>
				<TagPill resource={selectedTagResource} selectedID={selectedTagID} />
			</Suspense>
			<Suspense fallback={<Skeleton shape="chip" />}>
				<BrandsPill resource={selectedBrandResource} selectedID={selectedBrandID} />
			</Suspense>
			{changed >= 2 && (
				<Button variant="ghost" testID="products-filter-clear-all" onPress={actions.resetFilters}>
					{t('pos_products.clear_all')}
				</Button>
			)}
		</ChipRow>
	);
}
