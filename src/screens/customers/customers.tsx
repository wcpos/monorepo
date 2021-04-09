import * as React from 'react';
import { View, Text } from 'react-native';
import { useObservableState, useObservable, useObservableSuspense } from 'observable-hooks';
import { switchMap, tap, debounceTime, catchError, distinctUntilChanged } from 'rxjs/operators';
import Segment from '@wcpos/common/src/components/segment';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import Button from '@wcpos/common/src/components/button';
import Actions from './actions';
import Table from './table';

type Sort = import('@wcpos/common/src/components/table/types').Sort;

const Customers = () => {
	const { user, storeDB } = useAppState();
	const ui = useObservableSuspense(useUIResource('customers'));
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));

	const onSort: Sort = ({ sortBy, sortDirection }) => {
		console.log({ sortBy, sortDirection });
		// ui.updateWithJson({ sortBy, sortDirection });
	};

	const [query, setQuery] = React.useState({
		search: '',
		sortBy: 'firstName',
		sortDirection: 'asc',
	});

	if (!storeDB) {
		throw Error('something went wrong');
	}

	const customers$ = useObservable(
		// A stream of React elements!
		(inputs$) =>
			inputs$.pipe(
				distinctUntilChanged((a, b) => a[0] === b[0]),
				debounceTime(150),
				switchMap(([q]) => {
					const regexp = new RegExp(escape(q.search), 'i');
					const RxQuery = storeDB.collections.customers
						.find()
						// .find({
						// 	selector: {
						// 		name: { $regex: regexp },
						// 	},
						// })
						// @ts-ignore
						.sort({ [q.sortBy]: q.sortDirection });
					return RxQuery.$;
				}),
				catchError((err) => {
					console.error(err);
					return err;
				})
			),
		[query]
	);

	const customers = useObservableState(customers$, []);

	return (
		<React.Suspense fallback={<Text>loading customers...</Text>}>
			<Segment.Group>
				<Segment>
					<Actions columns={columns} query={query} ui={ui} />
				</Segment>
				<Segment grow>
					<Table
						customers={customers}
						columns={columns}
						sort={onSort}
						sortBy={ui.sortBy}
						sortDirection={ui.sortDirection}
					/>
				</Segment>
				<Segment>
					<Button
						title="Fetch customers"
						onPress={async () => {
							// @ts-ignore
							const replicationState = storeDB.customers.syncRestApi({
								pull: {},
							});
							replicationState.run(false);
						}}
					/>
				</Segment>
			</Segment.Group>
		</React.Suspense>
	);
};

export default Customers;
