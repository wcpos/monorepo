import * as React from 'react';
import { View, Text, PanResponderGestureState, LayoutChangeEvent } from 'react-native';
import { useObservable, useObservableState, useObservableSuspense } from 'observable-hooks';
import { from, of } from 'rxjs';
import { switchMap, tap, catchError, map, filter } from 'rxjs/operators';
// import { PanGestureHandler } from 'react-native-gesture-handler';
// import { useAnimatedGestureHandler, useSharedValue } from 'react-native-reanimated';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
// import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useStoreDB from '@wcpos/common/src/hooks/use-store-db';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import ErrorBoundary from '@wcpos/common/src/components/error-boundary';
import Draggable from '@wcpos/common/src/components/draggable';
import Gutter from '@wcpos/common/src/components/gutter';
import useOnLayout from '@wcpos/common/src/hooks/use-on-layout';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import clamp from 'lodash/clamp';
import Cart from './cart';
import Products from './products';
import Checkout from './checkout';
import * as Styled from './styles';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;
type CustomerDocument = import('@wcpos/common/src/database').CustomerDocument;
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;

interface POSContextProps {
	currentOrder?: OrderDocument;
	setCurrentOrder: React.Dispatch<React.SetStateAction<OrderDocument | undefined>>;
	currentCustomer?: CustomerDocument;
	setCurrentCustomer: React.Dispatch<React.SetStateAction<CustomerDocument | undefined>>;
}

export const POSContext = React.createContext<POSContextProps>({
	currentOrder: undefined,
	// @ts-ignore
	setCurrentOrder: undefined,
	currentCustomer: undefined,
	// @ts-ignore
	setCurrentCustomer: undefined,
});

/**
 *
 */
const POS = () => {
	const { storeDB } = useStoreDB();
	const productsUI = useObservableSuspense(useUIResource('posProducts'));
	const cartUI = useObservableSuspense(useUIResource('cart'));
	const [currentOrder, setCurrentOrder] = React.useState<OrderDocument | undefined>();
	const [currentCustomer, setCurrentCustomer] = React.useState<CustomerDocument | undefined>();

	/**
	 * Resizing the POS columns
	 */
	const isDragging = React.useRef(false);
	const productColumnWidth = useSharedValue(productsUI.get('width'));
	const [containerLayout, setContainerLayout] = useOnLayout();
	const [productColumnLayout, setProductColumnLayout] = useOnLayout();
	const handleStartColumnResize = React.useCallback((event, context) => {
		context.productColumnWidth = productColumnWidth.value;
	}, []);
	const handleColumnResize = React.useCallback(
		(event, context) => {
			if (productColumnLayout && containerLayout) {
				isDragging.current = true;
				productColumnWidth.value = withSpring(
					clamp((productColumnLayout.width + event.translationX) / containerLayout.width, 0.2, 0.8)
				);
			} else {
				console.log('@TODO - why null?', productColumnLayout);
			}
		},
		[containerLayout, productColumnLayout]
	);
	const handleEndColumnResize = React.useCallback((event, context) => {
		isDragging.current = false;
		productsUI.atomicPatch({ width: productColumnWidth.value });
	}, []);
	const productsColumnStyle = useAnimatedStyle(() => ({
		flexBasis: `${productColumnWidth.value * 100}%`,
	}));
	const handleContainerLayout = (event: LayoutChangeEvent) => {
		if (!isDragging.current) {
			setContainerLayout(event);
		}
	};
	const handleProductColumnLayout = (event: LayoutChangeEvent) => {
		if (!isDragging.current) {
			setProductColumnLayout(event);
		}
	};

	const orderQuery = storeDB.collections.orders.find().where('status').eq('pos-open');

	const orders: OrderDocument[] = useObservableState(
		orderQuery.$.pipe(
			filter((o: []) => {
				/** @TODO - remove this hack!
				 * why is orderQuery emitting on changes to order.lineItems??
				 */
				return orders?.length !== o.length;
			})
		),
		[]
	);

	useWhyDidYouUpdate('POS', {
		storeDB,
		productsUI,
		cartUI,
		currentOrder,
		orderQuery,
		orders,
		handleColumnResize,
		handleStartColumnResize,
		handleEndColumnResize,
		productsColumnStyle,
		handleContainerLayout,
		handleProductColumnLayout,
	});

	return (
		<POSContext.Provider
			value={{ currentOrder, setCurrentOrder, currentCustomer, setCurrentCustomer }}
		>
			<Styled.Container onLayout={handleContainerLayout}>
				<Styled.ProductsColumn
					as={Animated.View}
					onLayout={handleProductColumnLayout}
					style={productsColumnStyle}
				>
					<ErrorBoundary>
						<React.Suspense fallback={<Text>Loading products...</Text>}>
							<Products ui={productsUI} storeDB={storeDB} />
						</React.Suspense>
					</ErrorBoundary>
				</Styled.ProductsColumn>
				<Draggable
					onStart={handleStartColumnResize}
					onActive={handleColumnResize}
					onEnd={handleEndColumnResize}
				>
					<Animated.View>
						<Gutter />
					</Animated.View>
				</Draggable>
				{currentOrder && currentOrder.status === 'pos-checkout' ? (
					<Styled.CheckoutColumn>
						<Checkout />
					</Styled.CheckoutColumn>
				) : (
					<Styled.CartColumn>
						<ErrorBoundary>
							<React.Suspense fallback={<Text>Loading cart...</Text>}>
								<Cart ui={cartUI} orders={orders} />
							</React.Suspense>
						</ErrorBoundary>
					</Styled.CartColumn>
				)}
			</Styled.Container>
		</POSContext.Provider>
	);
};

export default POS;
