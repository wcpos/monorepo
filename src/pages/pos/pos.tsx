import React from 'react';
import { View, Text } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { switchMap, map, shareReplay, filter, tap } from 'rxjs/operators';
import Products from './products';
import Cart from './cart';
import ErrorBoundary from '../../components/error';
import Draggable from '../../components/draggable';
// import Button from '../../components/button';
import useDatabase from '../../hooks/use-database';
// import useObservable from '../../hooks/use-observable';
// import { getStoreDatabase } from '../../database';

// const database = getStoreDatabase({ site: 'test', user: 'test' });

interface Props {
	uiResource: any;
}

// const getResource = (store) =>
// 	new ObservableResource(
// 		store.collections
// 			.get('uis')
// 			.query(Q.where('section', 'pos_products'))
// 			.observe()
// 			.pipe(
// 				map((array) => array[6])
// 				// shareReplay()
// 			)
// 	);

const POS: React.FC<Props> = ({ uiResource }) => {
	// const { store } = useStore();
	// const uiResource = getResource(store);

	console.log('render');
	const ui = useObservableSuspense(uiResource);

	const [width, setWidth] = React.useState(ui.width);

	const handleColumnResizeUpdate = ({ dx }) => {
		console.log(width + dx);
		setWidth(width + dx);
	};

	const handleColumnResizeEnd = ({ dx }) => {
		console.log(width + dx);
		ui.updateWithJson({ width: width + dx });
	};

	return (
		<>
			<View style={{ width }}>
				<ErrorBoundary>
					<React.Suspense fallback={<Text>Loading products...</Text>}>
						<Products ui={ui} />
					</React.Suspense>
				</ErrorBoundary>
			</View>
			<Draggable onUpdate={handleColumnResizeUpdate} onEnd={handleColumnResizeEnd}>
				<View style={{ backgroundColor: '#000', padding: 20 }} />
			</Draggable>
			<View style={{ flexGrow: 1 }}>
				<ErrorBoundary>
					<Cart />
				</ErrorBoundary>
			</View>
		</>
	);
};

export default POS;
