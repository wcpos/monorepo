import * as React from 'react';
import { useWindowDimensions } from 'react-native';
import { useTheme } from 'styled-components/native';
import { useObservableSuspense } from 'observable-hooks';
import useUIResource from '@wcpos/common/src/hooks/use-ui-resource';
import { QueryProvider } from '@wcpos/common/src/hooks/use-query';
import ErrorBoundary from '@wcpos/common/src/components/error-boundary';
import Box from '@wcpos/common/src/components/box';
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

	const leftComponent = (
		<ErrorBoundary>
			<QueryProvider initialQuery={{ sortBy: 'name', sortDirection: 'asc' }}>
				<Products ui={productsUI} />
			</QueryProvider>
		</ErrorBoundary>
	);

	const rightComponent = (
		<ErrorBoundary>
			<CartTabs />
		</ErrorBoundary>
	);

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
