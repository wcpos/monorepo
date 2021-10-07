import * as React from 'react';
import { Text } from 'react-native';
import {
	useObservableState,
	useObservable,
	useObservableSuspense,
	useSubscription,
} from 'observable-hooks';
import { tap } from 'rxjs/operators';
import useDataObservable from '@wcpos/common/src/hooks/use-data-observable';
import Segment from '@wcpos/common/src/components/segment';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import Search from '@wcpos/common/src/components/search';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Table from '../common/table';
import UiSettings from '../common/ui-settings';
import cells from './cells';
import * as Styled from './styles';

type CustomersScreenProps = import('@wcpos/common/src/navigators/main').CustomersScreenProps;

const Customers = ({ navigation }: CustomersScreenProps) => {
	const { storeDB } = useAppState();
	const ui = useObservableSuspense(useUIResource('customers'));
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	const { data$, query, setQuery } = useDataObservable('customers', {
		search: '',
		sortBy: 'lastName',
		sortDirection: 'asc',
	});

	const onSearch = React.useCallback(
		(search: string) => {
			setQuery((prev) => ({ ...prev, search }));
		},
		[setQuery]
	);

	if (!storeDB) {
		throw Error('something went wrong');
	}

	useWhyDidYouUpdate('Customer Page', { data$, query, ui, columns, storeDB, navigation });

	return (
		<Styled.Container>
			<React.Suspense fallback={<Text>loading customers...</Text>}>
				<Segment.Group>
					<Segment>
						<Search
							label="Search Customers"
							placeholder="Search Customers"
							value={query.search}
							onSearch={onSearch}
							actions={[
								{
									name: 'add',
									action: () => {
										console.log('show modal');
									},
								},
								<UiSettings ui={ui} />,
							]}
						/>
					</Segment>
					<Segment grow>
						<Table
							collection={storeDB.collections.customers}
							columns={columns}
							// @ts-ignore
							data$={data$}
							setQuery={setQuery}
							sortBy={query.sortBy}
							sortDirection={query.sortDirection}
							cells={cells}
						/>
					</Segment>
					<Segment />
				</Segment.Group>
			</React.Suspense>
		</Styled.Container>
	);
};

export default Customers;
