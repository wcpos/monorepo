import * as React from 'react';

import get from 'lodash/get';
import { useObservableSuspense, useObservableState, useSubscription } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import Footer from './footer';
import { t } from '../../../../../../lib/translations';
import EmptyTableRow from '../../../../components/empty-table-row';
import { ProductVariationImage } from '../../../../components/product/variation-image';
import { ProductVariationName } from '../../../../components/product/variation-name';
import useProducts from '../../../../contexts/products';
import useVariations from '../../../../contexts/variations';
import { Price } from '../../cells/price';
import { SKU } from '../../cells/sku';
import { StockQuantity } from '../../cells/stock-quantity';
import { ProductVariationActions } from '../../cells/variation-actions';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
const cells = {
	actions: ProductVariationActions,
	image: ProductVariationImage,
	price: Price,
	name: ProductVariationName,
	sku: SKU,
	stock_quantity: StockQuantity,
};

/**
 *
 */
const VariationsTable = ({ extraData, parent }) => {
	const { resource, replicationState, loadNextPage, setQuery } = useVariations();
	const { data, count, hasMore } = useObservableSuspense(resource);
	const loading = useObservableState(replicationState.active$, false);
	const total = parent.variations.length;
	const { query$, shownVariations$ } = useProducts();

	/**
	 * Detect change in product query and variations query
	 */
	useSubscription(query$, (query) => {
		setQuery((prev) => {
			return {
				...prev,
				search: query.search,
				sortBy: query.sortBy === 'name' ? 'id' : query.sortBy,
				sortDirection: query.sortDirection,
			};
		});
	});

	/**
	 * Detect change in product query and variations query
	 */
	useSubscription(shownVariations$, (shownVariations) => {
		const attributes = get(shownVariations, [parent.uuid, 'query', 'selector', 'attributes']);
		if (attributes) {
			setQuery((prev) => {
				return {
					...prev,
					selector: {
						...prev.selector,
						attributes,
					},
				};
			});
		}
	});

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<ProductVariationDocument>>(
		({ item, column, index, cellWidth }) => {
			const Cell = get(cells, column.key);

			if (Cell) {
				return (
					<ErrorBoundary>
						<React.Suspense>
							<Cell item={item} column={column} index={index} cellWidth={cellWidth} />
						</React.Suspense>
					</ErrorBoundary>
				);
			}

			if (item[column.key]) {
				return <Text>{String(item[column.key])}</Text>;
			}

			return null;
		},
		[]
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
			extraData={{ ...extraData, cellRenderer }}
			ListEmptyComponent={<EmptyTableRow message={t('No variations found', { _tags: 'core' })} />}
			onEndReached={onEndReached}
			loading={loading}
			nestedScrollEnabled={true}
			hideHeader={true}
		/>
	);
};

export default VariationsTable;
