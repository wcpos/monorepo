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
import { useT } from '../../../../../contexts/translations';
import { useMutation } from '../../../hooks/use-mutation';
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
	const data = useObservableSuspense(query.resource);
	const context = useTable(); // get context from parent product, ie: columns
	const { cells } = useVariationTable();
	const loading = useObservableState(query.replicationState.active$, false);
	const t = useT();
	const mutation = useMutation({ endpoint: `products/${parent.id}/variations` });

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
			mutation.mutate({ document: variation, data });
		},
		[mutation]
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
								item={item}
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

			if (item[column.key]) {
				return <Text>{String(item[column.key])}</Text>;
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
			data={data}
			footer={<Footer query={query} parent={parent} count={data.length} loading={loading} />}
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
