import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import type { Query } from '@wcpos/query';

import { BrandsPill } from './brands-pill';
import { CategoryPill } from './category-pill';
import { FeaturedPill } from './featured-pill';
import { OnSalePill } from './on-sale-pill';
import { StockStatusPill } from './stock-status-pill';
import { TagPill } from './tag-pill';
import { useEngineDocumentByWooId } from '../../../hooks/use-engine-document';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
}

/**
 *
 */
export function FilterBar({ query }: Props) {
	const selectedTagID = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getElemMatchId('tags')))
	);
	const selectedBrandID = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getElemMatchId('brands')))
	);
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
			<StockStatusPill query={query} />
			<FeaturedPill query={query} />
			<OnSalePill query={query} />
			<CategoryPill query={query} />
			<Suspense>
				<TagPill query={query} resource={selectedTagResource} selectedID={selectedTagID} />
			</Suspense>
			<Suspense>
				<BrandsPill query={query} resource={selectedBrandResource} selectedID={selectedBrandID} />
			</Suspense>
		</HStack>
	);
}
