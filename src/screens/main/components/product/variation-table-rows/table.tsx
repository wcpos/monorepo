import * as React from 'react';

import get from 'lodash/get';
import { useObservableSuspense, useObservableState, useSubscription } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Table, { CellRenderer, useTable } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import { useVariationTable } from './context';
import Footer from './footer';
import { t } from '../../../../../lib/translations';
import { useProducts } from '../../../contexts/products';
import { useVariations } from '../../../contexts/variations';
import EmptyTableRow from '../../empty-table-row';
import { ProductVariationImage } from '../variation-image';
import { ProductVariationName } from '../variation-name';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
const sharedCells = {
	image: ProductVariationImage,
	name: ProductVariationName,
};

/**
 *
 */
const VariationsTable = ({ parent }) => {
	const { paginatedResource, replicationState, loadNextPage, setQuery } = useVariations();
	const { data, count, hasMore } = useObservableSuspense(paginatedResource);
	const loading = useObservableState(replicationState.active$, false);
	const total = parent.variations.length;
	// const { query } = useProducts();
	const context = useTable(); // get context from parent product, ie: columns
	const { cells } = useVariationTable();

	/**
	 * Detect change in product query and variations query
	 */
	// useSubscription(query$, (query) => {
	// 	setQuery((prev) => {
	// 		return {
	// 			...prev,
	// 			search: query.search,
	// 			sortBy: query.sortBy === 'name' ? 'id' : query.sortBy,
	// 			sortDirection: query.sortDirection,
	// 		};
	// 	});
	// });

	// /**
	//  * Detect change in product query and variations query
	//  */
	// useSubscription(shownVariations$, (shownVariations) => {
	// 	const attributes = get(shownVariations, [parent.uuid, 'query', 'selector', 'attributes']);
	// 	if (attributes) {
	// 		setQuery((prev) => {
	// 			return {
	// 				...prev,
	// 				selector: {
	// 					...prev.selector,
	// 					attributes,
	// 				},
	// 			};
	// 		});
	// 	}
	// });

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<ProductVariationDocument>>(
		({ item, column, index, cellWidth }) => {
			const Cell = get({ ...sharedCells, ...cells }, column.key);

			if (Cell) {
				return (
					<ErrorBoundary>
						<Suspense>
							<Cell
								item={item}
								column={column}
								index={index}
								cellWidth={cellWidth}
								parent={parent}
							/>
						</Suspense>
					</ErrorBoundary>
				);
			}

			if (item[column.key]) {
				return <Text>{String(item[column.key])}</Text>;
			}

			return null;
		},
		[cells, parent]
	);

	/**
	 *
	 */
	const onEndReached = React.useCallback(() => {
		if (hasMore) {
			loadNextPage();
		} else if (!loading && total > count) {
			replicationState.start({ fetchRemoteIDs: false });
		}
	}, [count, hasMore, loadNextPage, loading, replicationState, total]);

	/**
	 *
	 */
	return (
		<Table<ProductVariationDocument>
			data={data}
			footer={<Footer count={count} total={total} loading={loading} />}
			estimatedItemSize={100}
			context={{ ...context, cellRenderer }}
			ListEmptyComponent={<EmptyTableRow message={t('No variations found', { _tags: 'core' })} />}
			onEndReached={onEndReached}
			loading={loading}
			nestedScrollEnabled={true}
			hideHeader={true}
		/>
	);
};

export default VariationsTable;
