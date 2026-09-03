import * as React from 'react';

import { useRouter } from 'expo-router';

import { ButtonPill } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { useDocField } from '@wcpos/query';

import { normalizeFilterBar } from './filter-bar-layout';
import { QuickFilterButton } from './quick-filter-button';
import { BrandsPill } from '../../../components/product/filter-bar/brands-pill';
import { CategoryPill } from '../../../components/product/filter-bar/category-pill';
import { FeaturedPill } from '../../../components/product/filter-bar/featured-pill';
import { OnSalePill } from '../../../components/product/filter-bar/on-sale-pill';
import { StockStatusPill } from '../../../components/product/filter-bar/stock-status-pill';
import { TagPill } from '../../../components/product/filter-bar/tag-pill';
import { useEngineRecordByWooId } from '../../../hooks/use-engine-document';
import { useUISettings } from '../../../contexts/ui-settings';
import { useT } from '../../../../../contexts/translations';
import { useQueryState } from '../../../../../query';

export function POSFilterBar() {
	const { uiSettings } = useUISettings('pos-products');
	const items = normalizeFilterBar(useDocField(uiSettings, (value) => value.filterBar));
	const { selectedTagID, selectedBrandID } = useQueryState<
		'products',
		{ selectedTagID?: number; selectedBrandID?: number }
	>((state) => ({
		selectedTagID: state.filters.tags[0],
		selectedBrandID: state.filters.brands[0],
	}));
	const tag = useEngineRecordByWooId('tags', selectedTagID ?? 0);
	const brand = useEngineRecordByWooId('brands', selectedBrandID ?? 0);
	const router = useRouter();
	const t = useT();

	const pill = (id: string) => {
		switch (id) {
			case 'stock_status':
				return <StockStatusPill />;
			case 'featured':
				return <FeaturedPill />;
			case 'on_sale':
				return <OnSalePill />;
			case 'categories':
				return <CategoryPill />;
			case 'tags':
				return (
					<Suspense>
						<TagPill resource={tag} selectedID={selectedTagID} />
					</Suspense>
				);
			case 'brands':
				return (
					<Suspense>
						<BrandsPill resource={brand} selectedID={selectedBrandID} />
					</Suspense>
				);
		}
	};

	return (
		<HStack className="w-full flex-wrap">
			{items.map((item) =>
				item.type === 'quick' ? (
					<QuickFilterButton key={item.id} quickFilter={item} />
				) : item.show ? (
					<React.Fragment key={item.id}>{pill(item.id)}</React.Fragment>
				) : null
			)}
			<Tooltip>
				<TooltipTrigger asChild>
					<ButtonPill
						size="xs"
						variant="muted"
						leftIcon="sliders"
						testID="filter-bar-customize"
						onPress={() => router.push('/(app)/(modals)/filter-bar')}
					/>
				</TooltipTrigger>
				<TooltipContent>
					<Text>{t('pos_products.customize_filter_bar')}</Text>
				</TooltipContent>
			</Tooltip>
		</HStack>
	);
}
