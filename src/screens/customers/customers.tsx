import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { QueryProvider } from '@wcpos/common/src/hooks/use-query';
import Segment from '@wcpos/common/src/components/segment';
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
			<Segment.Group>
				<Segment style={{ flexDirection: 'row' }}>
					<SearchBar />
					<UiSettings ui={ui} />
				</Segment>
				<Segment grow>
					<Table ui={ui} />
				</Segment>
			</Segment.Group>
		</QueryProvider>
	);
};

export default Customers;
