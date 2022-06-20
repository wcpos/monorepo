import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { useTheme } from 'styled-components/native';
import { QueryProvider } from '@wcpos/hooks/src/use-query';
import Box from '@wcpos/components/src/box';
import useUIResource from '@wcpos/hooks/src/use-ui-resource';
import useIdAudit from '@wcpos/hooks/src/use-id-audit';
import useRestQuery from '@wcpos/hooks/src/use-rest-query-customers';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table from './table';
import SearchBar from './search-bar';
import UiSettings from '../common/ui-settings';

// type CustomersScreenProps = import('@wcpos/core/src/navigators/main').CustomersScreenProps;

/**
 *
 */
const Customers = () => {
	const ui = useObservableSuspense(useUIResource('customers'));
	const theme = useTheme();
	// useIdAudit('customers');
	// useRestQuery('customers');

	return (
		<QueryProvider initialQuery={{ sortBy: 'lastName', sortDirection: 'asc' }}>
			<Box
				raised
				rounding="medium"
				style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
			>
				<Box
					horizontal
					space="small"
					padding="small"
					align="center"
					style={{
						backgroundColor: theme.colors.grey,
						borderTopLeftRadius: theme.rounding.medium,
						borderTopRightRadius: theme.rounding.medium,
					}}
				>
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
