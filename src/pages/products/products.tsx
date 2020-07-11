import React from 'react';
import { View, Text } from 'react-native';
import { useObservableSuspense } from 'observable-hooks';
import Segment from '../../components/segment';
import Input from '../../components/textinput';
import Table from './table';
import Actions from './actions';
import useAppState from '../../hooks/use-app-state';

interface Props {}

const Products: React.FC<Props> = () => {
	const [{ store }] = useAppState();
	const ui = useObservableSuspense(store.uiResources.products);
	const products = useObservableSuspense(store.getDataResource('products'));

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
					<Actions ui={ui} />
				</Segment>
				<Segment grow>
					<Table
						products={products}
						columns={ui.columns}
						sort={onSort}
						sortBy={ui.sortBy}
						sortDirection={ui.sortDirection}
					/>
				</Segment>
				<Segment>
					<Text>Footer</Text>
				</Segment>
			</Segment.Group>
		</React.Suspense>
	);
};

export default Products;
