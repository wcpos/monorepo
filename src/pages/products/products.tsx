import React from 'react';
import { View, Text } from 'react-native';
import { useObservableSuspense } from 'observable-hooks';
import Segment from '../../components/segment';
import Table from './table';
import Actions from './actions';

interface Props {
	uiResource: any;
	productsResource: any;
}

const Products: React.FC<Props> = ({ uiResource, productsResource }) => {
	const products = useObservableSuspense(productsResource);
	const ui = useObservableSuspense(uiResource);
	const columns = useObservableSuspense(ui.columnsResource);

	const onResetUI = () => {
		ui.reset();
	};

	const onSort = ({ sortBy, sortDirection }) => {
		ui.updateWithJson({ sortBy, sortDirection });
	};

	return (
		<React.Suspense fallback={<Text>loading products...</Text>}>
			<Segment.Group>
				<Segment>
					<Actions columns={columns} resetUI={onResetUI} />
				</Segment>
				<Segment grow>
					<Table
						products={products}
						columns={columns}
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
