import React from 'react';
import { View, Text } from 'react-native';
import { useObservableSuspense } from 'observable-hooks';
import Segment from '../../components/segment';
import Table from './table';
import Actions from './actions';

interface Props {
	uiResource: any;
	dataResource: any;
}

const Products: React.FC<Props> = ({ uiResource, dataResource }) => {
	const products = useObservableSuspense(dataResource);
	const ui = useObservableSuspense(uiResource);
	const columns = useObservableSuspense(ui.columnsResource);

	return (
		<Segment.Group>
			<Segment>
				<React.Suspense fallback={<Text>loading actions...</Text>}>
					<Actions
						columns={columns}
						resetUI={() => {
							ui.reset();
						}}
					/>
				</React.Suspense>
			</Segment>
			<Segment grow>
				<React.Suspense fallback={<Text>loading products...</Text>}>
					<Table products={products} columns={columns} />
				</React.Suspense>
			</Segment>
			<Segment>
				<Text>Footer</Text>
			</Segment>
		</Segment.Group>
	);
};

export default Products;
