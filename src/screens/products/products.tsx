import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { QueryProvider } from '@wcpos/common/src/hooks/use-query';
import Box from '@wcpos/common/src/components/box';
import useUIResource from '@wcpos/common/src/hooks/use-ui-resource';
import Table from './table';
import SearchBar from './search-bar';
import UiSettings from '../common/ui-settings';

/**
 *
 */
const Products = () => {
	const ui = useObservableSuspense(useUIResource('products'));
	// useIdAudit('products');
	// useRestQuery('products');

	return (
		<QueryProvider initialQuery={{ sortBy: 'name', sortDirection: 'asc' }}>
			<Box
				raised
				rounding="medium"
				style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
			>
				<Box horizontal space="small" padding="small" align="center">
					<SearchBar />
					<UiSettings ui={ui} />
				</Box>
				<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
					<Table ui={ui} />
				</Box>
			</Box>
		</QueryProvider>
	);
};

export default Products;
