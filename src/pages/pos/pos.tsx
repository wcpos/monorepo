import React from 'react';
import { View, Text } from 'react-native';
import { useObservableSuspense, useObservableState } from 'observable-hooks';
import Products from './products';
import Cart from './cart';
import ErrorBoundary from '../../components/error';
import Draggable from '../../components/draggable';
import useAppState from '../../hooks/use-app-state';

interface Props {}

const POS: React.FC<Props> = () => {
	const [{ storeDB }] = useAppState();
	const width = useObservableState(
		storeDB.ui.pos_products.get$('width'),
		storeDB.ui.pos_products.get('width')
	);
	console.log('render');
	// const [width, setWidth] = React.useState(storeDB.ui.pos_products.width);
	// const width = useObservableState(productsUI.width$);
	// console.log(width);

	const handleColumnResizeUpdate = ({ dx }) => {
		// console.log(ui.width + dx);
		// ui.updateWithJson({ width: ui.width + dx });
	};

	const handleColumnResizeEnd = ({ dx }) => {
		// console.log(ui.width + dx);
		// ui.updateWithJson({ width: ui.width + dx });
	};

	return (
		<>
			<View style={{ width }}>
				<ErrorBoundary>
					<React.Suspense fallback={<Text>Loading products...</Text>}>
						<Products ui={storeDB.ui.pos_products} />
					</React.Suspense>
				</ErrorBoundary>
			</View>
			<Draggable onUpdate={handleColumnResizeUpdate} onEnd={handleColumnResizeEnd}>
				<View style={{ backgroundColor: '#000', padding: 20 }} />
			</Draggable>
			<View style={{ flexGrow: 1 }}>
				<ErrorBoundary>
					<React.Suspense fallback={<Text>Loading cart...</Text>}>
						<Cart ui={storeDB.ui.pos_cart} />
					</React.Suspense>
				</ErrorBoundary>
			</View>
		</>
	);
};

export default POS;
