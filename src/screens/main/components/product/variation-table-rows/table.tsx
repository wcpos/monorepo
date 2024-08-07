import * as React from 'react';

import get from 'lodash/get';
import { useObservableSuspense, useObservableState, useSubscription } from 'observable-hooks';

import { useReplicationState } from '@wcpos/query';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { Suspense } from '@wcpos/tailwind/src/suspense';
import Table, { CellRenderer, useTable } from '@wcpos/tailwind/src/table';
import { Text } from '@wcpos/tailwind/src/text';
import log from '@wcpos/utils/src/logger';

import { useVariationTable } from './context';
import Footer from './footer';
import { useT } from '../../../../../contexts/translations';
import { useMutation } from '../../../hooks/mutations/use-mutation';
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
const VariationsTable = ({ query, parent }) => {
	const result = useObservableSuspense(query.resource);
	const context = useTable(); // get context from parent product, ie: columns
	const { cells } = useVariationTable();
	const { active$ } = useReplicationState(query);
	const loading = useObservableState(active$, false);
	const t = useT();
	const { patch } = useMutation({
		collectionName: 'variations',
		endpoint: `products/${parent.id}/variations`,
	});

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
	 * @TODO - the variation table is shared between POS and Products page
	 * I'm not sure if this should be here
	 */
	const handleChange = React.useCallback(
		async (variation: ProductVariationDocument, data: Record<string, unknown>) => {
			patch({ document: variation, data });
		},
		[patch]
	);

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
								item={item.document}
								column={column}
								index={index}
								cellWidth={cellWidth}
								parent={parent}
								onChange={handleChange}
							/>
						</Suspense>
					</ErrorBoundary>
				);
			}

			if (item.document[column.key]) {
				return <Text>{String(item.document[column.key])}</Text>;
			}

			return null;
		},
		[cells, handleChange, parent]
	);

	/**
	 *
	 */
	// const onEndReached = React.useCallback(() => {
	// 	if (hasMore) {
	// 		loadNextPage();
	// 	} else if (!loading && total > count) {
	// 		replicationState.start({ fetchRemoteIDs: false });
	// 	}
	// }, [count, hasMore, loadNextPage, loading, replicationState, total]);

	/**
	 *
	 */
	return (
		<Table<ProductVariationDocument>
			data={result.hits}
			footer={<Footer query={query} parent={parent} count={result.count} loading={loading} />}
			estimatedItemSize={100}
			context={{ ...context, cellRenderer }}
			ListEmptyComponent={<EmptyTableRow message={t('No variations found', { _tags: 'core' })} />}
			// onEndReached={onEndReached}
			loading={loading}
			hideHeader={true}
		/>
	);
};

export default VariationsTable;
