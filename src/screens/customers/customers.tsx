import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { QueryProvider } from '@wcpos/common/src/hooks/use-query';
import Segment from '@wcpos/common/src/components/segment';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import useIdAudit from '@wcpos/common/src/hooks/use-id-audit';
import useRestQuery from '@wcpos/common/src/hooks/use-rest-query-customers';
import ErrorBoundary from '@wcpos/common/src/components/error-boundary';
import Table from './table';
import SearchBar from './search-bar';
import * as Styled from './styles';

// type CustomersScreenProps = import('@wcpos/common/src/navigators/main').CustomersScreenProps;

/**
 *
 */
const Customers = () => {
	const resources = useUIResource();
	const ui = useObservableSuspense(resources.customers);
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	useIdAudit('customers');
	useRestQuery('customers');

	return (
		<Segment.Group>
			<Segment>
				<SearchBar ui={ui} />
			</Segment>
			<Segment grow>
				<Table columns={columns} />
			</Segment>
		</Segment.Group>
	);
};

const WrappedCustomers = () => {
	return (
		<ErrorBoundary>
			<QueryProvider initialQuery={{ sortBy: 'lastName', sortDirection: 'asc' }}>
				<Customers />
			</QueryProvider>
		</ErrorBoundary>
	);
};

export default WrappedCustomers;
