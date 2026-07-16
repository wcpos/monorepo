import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';

import { BrandsPill } from './brands-pill';
import { CategoryPill } from './category-pill';
import { FeaturedPill } from './featured-pill';
import { OnSalePill } from './on-sale-pill';
import { StockStatusPill } from './stock-status-pill';
import { TagPill } from './tag-pill';
import { useEngineDocumentByWooId } from '../../../hooks/use-engine-document';
import { useQueryState } from '../../../../../query';

/**
 *
 */
export function FilterBar() {
	const { selectedTagID, selectedBrandID } = useQueryState<
		'products',
		{ selectedTagID?: number; selectedBrandID?: number }
	>((state) => ({
		selectedTagID: state.filters.tags?.[0],
		selectedBrandID: state.filters.brands?.[0],
	}));
	const selectedTagResource = useEngineDocumentByWooId<
		import('@wcpos/database').ProductTagDocument
	>('products/tags', selectedTagID ?? 0);
	const selectedBrandResource = useEngineDocumentByWooId<
		import('@wcpos/database').ProductCategoryDocument
	>('products/brands', selectedBrandID ?? 0);

	/**
	 *
	 */
	return (
		<HStack className="w-full flex-wrap">
			<StockStatusPill />
			<FeaturedPill />
			<OnSalePill />
			<CategoryPill />
			<Suspense>
				<TagPill resource={selectedTagResource} selectedID={selectedTagID} />
			</Suspense>
			<Suspense>
				<BrandsPill resource={selectedBrandResource} selectedID={selectedBrandID} />
			</Suspense>
		</HStack>
	);
}
