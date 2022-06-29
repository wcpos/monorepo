import * as React from 'react';
import { useWindowDimensions } from 'react-native';
import { useTheme } from 'styled-components/native';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { distinctUntilChanged } from 'rxjs';
import { map, debounceTime } from 'rxjs/operators';
import isEqual from 'lodash/isEqual';
import orderBy from 'lodash/orderBy';
import useUIResource from '@wcpos/hooks/src/use-ui-resource';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import useAppState from '@wcpos/hooks/src/use-app-state';
import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import OpenOrders from './cart/open-orders';
import Products from './products';
import ResizeableColumns from './resizable-columns';
import POSTabs from './tabs';
import POSContextProvider from './context';

/**
 *
 */
const POS = () => {
	const productsUI = useObservableSuspense(useUIResource('pos.products'));
	const theme = useTheme();
	const { storeDB } = useAppState();

	/**
	 * TODO: useWindowDimensions updates state which triggers re-rendering of the whole POS
	 * Is there a way to use a reanimated shared value or similar?
	 */
	const dimensions = useWindowDimensions();

	/**
	 * Order query resource is wrapped in memo to stop new query being created
	 * - caused a bug where currentOrder was being changed to index 0 on window resize
	 */
	// const openOrdersResource = React.useMemo(
	// 	() =>
	// 		new ObservableResource(
	// 			storeDB.collections.orders
	// 				.find()
	// 				.where('status')
	// 				.eq('pos-open')
	// 				.$.pipe(
	// 					// debounceTime(100),
	// 					map((orders) => {
	// 						const sortedOrders = orderBy(orders, ['date_created_gmt'], ['asc']);
	// 						const newOrder = storeDB.collections.orders.newDocument({ status: 'pos-open' });
	// 						sortedOrders.push(newOrder);
	// 						return sortedOrders;
	// 					}),
	// 					/**
	// 					 * the orderQuery will emit on every change, eg: order total
	// 					 * this causes many unnecessary re-renders
	// 					 * so we compare the previous query with the current query result
	// 					 */
	// 					distinctUntilChanged((prev, curr) => {
	// 						return isEqual(
	// 							prev.map((doc) => doc._id),
	// 							curr.map((doc) => doc._id)
	// 						);
	// 					})
	// 				)
	// 		),
	// 	[storeDB.collections.orders]
	// );

	useWhyDidYouUpdate('POS', {
		productsUI,
		// openOrdersResource,
		theme,
		dimensions,
		storeDB,
	});

	return (
		<POSContextProvider>
			{dimensions.width >= theme.screens.small ? (
				<ResizeableColumns
					ui={productsUI}
					leftComponent={
						<ErrorBoundary>
							<Products ui={productsUI} />
						</ErrorBoundary>
					}
					rightComponent={
						<ErrorBoundary>
							<OpenOrders />
						</ErrorBoundary>
					}
				/>
			) : (
				<POSTabs
					leftComponent={
						<ErrorBoundary>
							<Products ui={productsUI} />
						</ErrorBoundary>
					}
					rightComponent={
						<ErrorBoundary>
							<OpenOrders />
						</ErrorBoundary>
					}
				/>
			)}
		</POSContextProvider>
	);
};

export default POS;
