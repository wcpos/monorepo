import React from 'react';
import { View, Text } from 'react-native';
import { useObservable, useObservableState } from 'observable-hooks';
import { switchMap, tap, debounceTime, catchError, distinctUntilChanged } from 'rxjs/operators';
import Segment from '../../components/segment';
import Input from '../../components/textinput';
import Table from './table';
import Actions from './actions';
import useAppState from '../../hooks/use-app-state';

interface Props {}

const Products: React.FC<Props> = () => {
	const [{ storeDB }] = useAppState();
	const ui = storeDB.getUI('products');

	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));

	const [query, setQuery] = React.useState({
		search: '',
		sortBy: 'name',
		sortDirection: 'asc',
	});

	const products$ = useObservable(
		// A stream of React elements!
		(inputs$) =>
			inputs$.pipe(
				distinctUntilChanged((a, b) => a[0] === b[0]),
				debounceTime(150),
				switchMap(([q]) => {
					const regexp = new RegExp(escape(q.search), 'i');
					const RxQuery = storeDB.collections.products
						.find({
							selector: {
								name: { $regex: regexp },
							},
						})
						.sort({ [q.sortBy]: q.sortDirection });
					return RxQuery.$;
				}),
				catchError((err) => {
					console.error(err);
				})
			),
		[query] as const
	);

	const products = useObservableState(products$, []);

	const onSearch = (value) => {
		console.log(value);
	};

	const onSort = ({ sortBy, sortDirection }) => {
		console.log({ sortBy, sortDirection });
		// ui.updateWithJson({ sortBy, sortDirection });
	};

	return (
		<React.Suspense fallback={<Text>loading products...</Text>}>
			<Segment.Group>
				<Segment>
					<Input placeholder="Search products" onChangeText={onSearch} />
					<Actions columns={columns} query={query} />
				</Segment>
				<Segment grow>
					<Table columns={columns} products={products} />
				</Segment>
				<Segment>
					<Text>Footer</Text>
				</Segment>
			</Segment.Group>
		</React.Suspense>
	);
};

export default Products;
