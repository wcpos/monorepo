import * as React from 'react';
import { useWindowDimensions } from 'react-native';
import { useTheme } from 'styled-components/native';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { distinctUntilChanged } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import isEqual from 'lodash/isEqual';
import orderBy from 'lodash/orderBy';
import useUIResource from '@wcpos/common/src/hooks/use-ui-resource';
import { QueryProvider } from '@wcpos/common/src/hooks/use-query';
import ErrorBoundary from '@wcpos/common/src/components/error-boundary';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Text from '@wcpos/common/src/components/text';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import CartTabs from './cart/tabs';
import Products from './products';
import ResizeableColumns from './resizable-columns';
import POSTabs from './tabs';
import POSContentProvider from './context';

/**
 *
 */
const POS = () => {
	const productsUI = useObservableSuspense(useUIResource('pos.products'));
	const theme = useTheme();
	const dimensions = useWindowDimensions();
	const { storeDB } = useAppState();

	const openOrdersResource = new ObservableResource(
		storeDB.collections.orders
			.find()
			.where('status')
			.eq('pos-open')
			.$.pipe(
				map((orders) => {
					const sortedOrders = orderBy(orders, ['date_created_gmt'], ['asc']);
					const newOrder = storeDB.collections.orders.newDocument({ status: 'pos-open' });
					sortedOrders.push(newOrder);
					return sortedOrders;
				}),
				/**
				 * the orderQuery will emit on every change, eg: order total
				 * this causes many unnecessary re-renders
				 * so we compare the previous query with the current query result
				 */
				distinctUntilChanged((prev, curr) => {
					return isEqual(
						prev.map((doc) => doc._id),
						curr.map((doc) => doc._id)
					);
				})
			)
	);

	const leftComponent = (
		<ErrorBoundary>
			<QueryProvider initialQuery={{ sortBy: 'name', sortDirection: 'asc' }}>
				<Products ui={productsUI} />
			</QueryProvider>
		</ErrorBoundary>
	);

	const rightComponent = (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>loading orders...</Text>}>
				<CartTabs ordersResource={openOrdersResource} />
			</React.Suspense>
		</ErrorBoundary>
	);

	useWhyDidYouUpdate('POS', {
		productsUI,
		openOrdersResource,
		theme,
		dimensions,
		leftComponent,
		rightComponent,
		storeDB,
	});

	return (
		<POSContentProvider>
			{dimensions.width >= theme.screens.small ? (
				<ResizeableColumns
					ui={productsUI}
					leftComponent={leftComponent}
					rightComponent={rightComponent}
				/>
			) : (
				<POSTabs leftComponent={leftComponent} rightComponent={rightComponent} />
			)}
		</POSContentProvider>
	);
};

export default POS;
