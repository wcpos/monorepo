import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { QueryProvider } from '@wcpos/common/src/hooks/use-query';
import Box from '@wcpos/common/src/components/box';
import useUIResource from '@wcpos/common/src/hooks/use-ui-resource';
import useIdAudit from '@wcpos/common/src/hooks/use-id-audit';
import useRestQuery from '@wcpos/common/src/hooks/use-rest-query-customers';
import ErrorBoundary from '@wcpos/common/src/components/error-boundary';
import Table from './table';
import SearchBar from './search-bar';
import UiSettings from '../common/ui-settings';
import * as Styled from './styles';

// type CustomersScreenProps = import('@wcpos/common/src/navigators/main').CustomersScreenProps;

/**
 *
 */
const Customers = () => {
	const ui = useObservableSuspense(useUIResource('customers'));
	// useIdAudit('customers');
	// useRestQuery('customers');

	return (
		<QueryProvider initialQuery={{ sortBy: 'lastName', sortDirection: 'asc' }}>
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

export default Customers;
