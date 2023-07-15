import * as React from 'react';

import get from 'lodash/get';
import { useObservableSuspense, useObservableState, useSubscription } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import useSnackbar from '@wcpos/components/src/snackbar';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import Footer from './footer';
import { t } from '../../../../../../lib/translations';
import DateCreated from '../../../../components/date';
import EmptyTableRow from '../../../../components/empty-table-row';
import { ProductVariationImage } from '../../../../components/product/variation-image';
import { ProductVariationName } from '../../../../components/product/variation-name';
import useProducts from '../../../../contexts/products';
import usePushDocument from '../../../../contexts/use-push-document';
import useVariations from '../../../../contexts/variations';
import Actions from '../../cells/actions';
import Barcode from '../../cells/barcode';
import EdittablePrice from '../../cells/edittable-price';
import Price from '../../cells/price';
import StockQuanity from '../../cells/stock-quantity';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
const cells = {
	actions: Actions,
	barcode: Barcode,
	image: ProductVariationImage,
	name: ProductVariationName,
	price: Price,
	regular_price: EdittablePrice,
	sale_price: EdittablePrice,
	stock_quantity: StockQuanity,
	date_created: DateCreated,
	date_modified: DateCreated,
};

/**
 *
 */
const VariationsTable = ({ extraData, parent }) => {
	const { resource, replicationState, loadNextPage, setQuery } = useVariations();
	const { data, count, hasMore } = useObservableSuspense(resource);
	const addSnackbar = useSnackbar();
	const pushDocument = usePushDocument();
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
	const handleChange = React.useCallback(
		async (product: ProductVariationDocument, data: Record<string, unknown>) => {
			try {
				const latest = product.getLatest();
				const doc = await latest.patch(data);
				const success = await pushDocument(doc);
				if (isRxDocument(success)) {
					addSnackbar({
						message: t('Variation {id} saved', { _tags: 'core', id: success.id }),
					});
				}
			} catch (error) {
				log.error(error);
				addSnackbar({
					message: t('There was an error: {message}', { _tags: 'core', message: error.message }),
				});
			}
		},
		[addSnackbar, pushDocument]
	);

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
							<Cell
								item={item}
								column={column}
								index={index}
								cellWidth={cellWidth}
								onChange={handleChange}
							/>
						</React.Suspense>
					</ErrorBoundary>
				);
			}

			if (item[column.key]) {
				return <Text>{String(item[column.key])}</Text>;
			}

			return null;
		},
		[handleChange]
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
