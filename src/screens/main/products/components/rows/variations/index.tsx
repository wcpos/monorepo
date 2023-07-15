import * as React from 'react';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

import Table from './table';
import VariationsFilterBar from '../../../../components/product/variation-table-rows/filter-bar';
import useProducts from '../../../../contexts/products';
import { VariationsProvider } from '../../../../contexts/variations';

const Variations = ({ item, extraData }) => {
	const { parent } = item;
	const { query$ } = useProducts();

	/**
	 *
	 */
	const initialQuery = React.useMemo(() => {
		const query = query$.getValue();
		return {
			sortBy: query.sortBy === 'name' ? 'id' : query.sortBy,
			sortDirection: query.sortDirection,
		};
	}, [query$]);

	return (
		<VariationsProvider parent={parent} initialQuery={initialQuery}>
			<Box style={{ height: 500 }}>
				<ErrorBoundary>
					<VariationsFilterBar parent={parent} />
				</ErrorBoundary>
				<Box style={{ flexGrow: 1, flexShrink: 0, flexBasis: '0%' }}>
					<React.Suspense>
						<Table extraData={extraData} parent={parent} />
					</React.Suspense>
				</Box>
			</Box>
		</VariationsProvider>
	);
};

export default Variations;
