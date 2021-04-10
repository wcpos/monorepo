import * as React from 'react';
import { View, Text } from 'react-native';
import { useObservable, useObservableState, useObservableSuspense } from 'observable-hooks';
import { from, of } from 'rxjs';
import { switchMap, tap, catchError, map, filter } from 'rxjs/operators';
// import { PanGestureHandler } from 'react-native-gesture-handler';
// import { useAnimatedGestureHandler, useSharedValue } from 'react-native-reanimated';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import ErrorBoundary from '@wcpos/common/src/components/error';
import Draggable from '@wcpos/common/src/components/draggable';
import Cart from './cart';
import Products from './products';
import * as Styled from './styles';

type OrderDocument = import('@wcpos/common/src/database/orders').OrderDocument;
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;

interface IPOSContent {
	currentOrder?: OrderDocument;
	setCurrentOrder: React.Dispatch<React.SetStateAction<OrderDocument | undefined>>;
}

export const POSContext = React.createContext<IPOSContent>({
	currentOrder: undefined,
	// @ts-ignore
	setCurrentOrder: undefined,
});

const POS = () => {
	const { storeDB } = useAppState() as { storeDB: StoreDatabase };
	const productsUI = useObservableSuspense(useUIResource('posProducts'));
	const cartUI = useObservableSuspense(useUIResource('posCart'));
	const [currentOrder, setCurrentOrder] = React.useState<OrderDocument | undefined>();

	// fetch order
	// const orderQuery = storeDB.collections.orders.findOne();
	// const order$ = orderQuery.$.pipe(
	// 	filter((order: any) => order),
	// 	switchMap((order: any) => order.$.pipe(map(() => order))),
	// 	tap((res) => console.log(res))
	// );
	const orderQuery = storeDB.collections.orders.find().where('status').eq('pending');
	// .sort({ dateCreatedGmt: -1 });
	const orders: OrderDocument[] | undefined = useObservableState(orderQuery.$);
	// const order$ = orderQuery.$.pipe(
	// 	filter((order: any) => order),
	// 	tap((res) => {
	// 		debugger;
	// 	}),
	// 	switchMap((order: any) => order.$.pipe(map(() => order))),
	// 	tap((res) => console.log(res))
	// );

	// const [width] = useObservableState(() => productsUI.get$('width'), productsUI.get('width'));
	console.log('render');
	// const [width, setWidth] = React.useState(storeDB.ui.pos_products.width);
	// const width = useObservableState(productsUI.width$);
	// console.log(width);

	const handleColumnResizeUpdate = ({ dx }: { dx: number }) => {
		// console.log(ui.width + dx);
		// ui.updateWithJson({ width: ui.width + dx });
	};

	const handleColumnResizeEnd = ({ dx }: { dx: number }) => {
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
		<POSContext.Provider value={{ currentOrder, setCurrentOrder }}>
			<Styled.Container>
				<Styled.Column>
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
							{orders ? <Cart ui={cartUI} orders={orders} /> : null}
						</React.Suspense>
					</ErrorBoundary>
				</Styled.Column>
			</Styled.Container>
		</POSContext.Provider>
	);
};

export default POS;
