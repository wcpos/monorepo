import * as React from 'react';
import { View, Text } from 'react-native';
import { useObservable, useObservableState } from 'observable-hooks';
// import { PanGestureHandler } from 'react-native-gesture-handler';
// import { useAnimatedGestureHandler, useSharedValue } from 'react-native-reanimated';
import Products from './products';
import Cart from './cart';
import ErrorBoundary from '../../components/error';
import Draggable from '../../components/draggable';
import useAppState from '../../hooks/use-app-state';
import * as Styled from './styles';

interface Props {}

const POS: React.FC<Props> = () => {
	const [{ storeDB }] = useAppState();
	const productsUI = storeDB.getUI('pos_products');

	const [width] = useObservableState(() => productsUI.get$('width'), productsUI.get('width'));
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

	// @TODO - wait until react-native-reanimated v2 is stable
	// const translateX = useSharedValue(0);
	// const gestureHandler = useAnimatedGestureHandler({
	// 	onStart: (event, ctx) => {
	// 		ctx.offsetX = translateX.value;
	// 	},
	// 	onActive: (event, ctx) => {
	// 		translateX.value = ctx.offsetX + event.translationX;
	// 	},
	// 	onEnd: (event) => {},
	// });

	return (
		<Styled.Container>
			<Styled.Column style={{ width }}>
				<ErrorBoundary>
					<React.Suspense fallback={<Text>Loading products...</Text>}>
						<Products ui={productsUI} />
					</React.Suspense>
				</ErrorBoundary>
			</Styled.Column>
			<Draggable onUpdate={handleColumnResizeUpdate} onEnd={handleColumnResizeEnd}>
				<View style={{ backgroundColor: '#000', padding: 20 }} />
			</Draggable>
			{/* <PanGestureHandler onGestureEvent={gestureHandler}>
				<View style={{ backgroundColor: '#000', padding: 20 }} />
			</PanGestureHandler> */}
			<Styled.Column>
				<ErrorBoundary>
					<React.Suspense fallback={<Text>Loading cart...</Text>}>
						<Cart />
					</React.Suspense>
				</ErrorBoundary>
			</Styled.Column>
		</Styled.Container>
	);
};

export default POS;
