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
	const [{ store }] = useAppState();
	const productsUI = useObservableSuspense(store.uiResources.pos_products);
	console.log('render');
	const [width, setWidth] = React.useState('');
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

	React.useEffect(() => {
		productsUI.width$.subscribe((x) => setWidth(x));
		return productsUI.width$.unsubscribe;
	}, []);

	return (
		<>
			<View style={{ width }}>
				<ErrorBoundary>
					<React.Suspense fallback={<Text>Loading products...</Text>}>
						<Products ui={productsUI} />
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
