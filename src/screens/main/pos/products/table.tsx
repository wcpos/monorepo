import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableSuspense } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableExtraDataProps } from '@wcpos/components/src/table';

import Footer from './footer';
import SimpleProductTableRow from './rows/simple';
import VariableProductTableRow from './rows/variable';
import VariationsTableRow from './rows/variations';
import { t } from '../../../../lib/translations';
import EmptyTableRow from '../../components/empty-table-row';
import useProducts from '../../contexts/products';

type ProductDocument = import('@wcpos/database').ProductDocument;
type UISettingsColumn = import('../../contexts/ui-settings').UISettingsColumn;

interface POSProductsTableProps {
	uiSettings: import('../../contexts/ui-settings').UISettingsDocument;
}

// Table Rows
const TABLE_ROW_COMPONENTS = {
	simple: SimpleProductTableRow,
	variable: VariableProductTableRow,
	variations: VariationsTableRow,
};

/**
 *
 */
const POSProductsTable = ({ uiSettings }: POSProductsTableProps) => {
	const { query$, setQuery, resource, replicationState, loadNextPage, shownVariations$ } =
		useProducts();
	const { data, count, hasMore } = useObservableSuspense(resource);
	const shownVariations = useObservableState(shownVariations$, {});
	const loading = useObservableState(replicationState.active$, false);
	const query = useObservableState(query$, query$.getValue());
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];
	// const [shownItems, setShownItems] = React.useState<Record<string, boolean>>({});
	// const shownItems = React.useRef<Record<string, boolean>>({});

	/**
	 *
	 */
	const productsAndVariations = React.useMemo(() => {
		const result = [];

		data.forEach((record) => {
			result.push(record);

			if (shownVariations[record.uuid]) {
				result.push({ type: 'variations', parent: record });
			}
		});

		return result;
	}, [data, shownVariations]);

	/**
	 *
	 */
	const context = React.useMemo<TableExtraDataProps<ProductDocument>>(() => {
		return {
			columns: columns.filter((column) => column.show),
			sort: ({ sortBy, sortDirection }) => {
				setQuery('sortBy', sortBy);
				setQuery('sortDirection', sortDirection);
			},
			sortBy: query.sortBy,
			sortDirection: query.sortDirection,
			headerLabel: ({ column }) => uiSettings.getLabel(column.key),
			// shownItems,
		};
	}, [columns, query.sortBy, query.sortDirection, setQuery, uiSettings]);

	/**
	 *
	 */
	const onEndReached = React.useCallback(() => {
		if (hasMore) {
			loadNextPage();
		}
	}, [hasMore, loadNextPage]);

	/**
	 *
	 */
	const renderItem = React.useCallback((props) => {
		let Component = TABLE_ROW_COMPONENTS[props.item.type];

		// If we still didn't find a component, use SimpleProductTableRow as a fallback
		// eg: Grouped products
		if (!Component) {
			Component = SimpleProductTableRow;
		}

		return (
			<ErrorBoundary>
				<Component {...props} />
			</ErrorBoundary>
		);
	}, []);

	/**
	 *
	 */
	return (
		<Table<ProductDocument>
			data={productsAndVariations}
			footer={<Footer count={count} />}
			estimatedItemSize={150}
			renderItem={renderItem}
			extraData={context}
			ListEmptyComponent={<EmptyTableRow message={t('No products found', { _tags: 'core' })} />}
			onEndReached={onEndReached}
			loading={loading}
		/>
	);
};

export default POSProductsTable;
