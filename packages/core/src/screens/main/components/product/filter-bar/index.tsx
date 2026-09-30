import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { Suspense } from '@wcpos/components/suspense';

import { useT } from '../../../../../contexts/translations';
import { BrandsPill } from './brands-pill';
import { CategoryPill } from './category-pill';
import { FeaturedPill } from './featured-pill';
import { OnSalePill } from './on-sale-pill';
import { StockStatusPill } from './stock-status-pill';
import { TagPill } from './tag-pill';
import { useEngineRecordByWooId } from '../../../hooks/use-engine-document';
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
		<View className="p-2">
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerClassName="items-center gap-2"
			>
				<StockStatusPill />
				<FeaturedPill />
				<OnSalePill />
				<Suspense>
					<CategoryPill />
				</Suspense>
				<Suspense>
					<TagPill resource={selectedTagResource} selectedID={selectedTagID} />
				</Suspense>
				<Suspense>
					<BrandsPill resource={selectedBrandResource} selectedID={selectedBrandID} />
				</Suspense>
				{changed >= 2 && (
					<Button variant="ghost" testID="products-filter-clear-all" onPress={actions.resetFilters}>
						{t('pos_products.clear_all')}
					</Button>
				)}
			</ScrollView>
		</View>
	);
}
