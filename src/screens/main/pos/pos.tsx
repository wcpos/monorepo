import * as React from 'react';
import { useTheme } from 'styled-components/native';
import { useObservableSuspense } from 'observable-hooks';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import useStore from '@wcpos/hooks/src/use-store';
import { TaxesProvider } from '@wcpos/core/src/contexts/taxes';
import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import { OrdersProvider } from '@wcpos/core/src/contexts/orders';
import { OpenOrdersProvider } from './contexts/open-orders';
import ResizeableColumns from './resizable-columns';
import POSTabs from './tabs';

/**
 *
 */
const POS = () => {
	const { storeDB, uiResources } = useStore();
	const productsUI = useObservableSuspense(uiResources['pos.products']);
	const theme = useTheme();
	console.log('render POS');

	/**
	 *
	 */
	const initialQuery = React.useMemo(
		() => ({
			sortBy: 'date_created_gmt',
			sortDirection: 'desc',
			filters: { status: 'pos-open' },
		}),
		[]
	);

	useWhyDidYouUpdate('POS', {
		productsUI,
		// openOrdersResource,
		theme,
		storeDB,
	});

	return (
		<OrdersProvider initialQuery={initialQuery}>
			<OpenOrdersProvider>
				<TaxesProvider initialQuery={{ country: 'GB' }}>
					{theme._dimensions.width >= theme.screens.small ? (
						<ResizeableColumns ui={productsUI} />
					) : (
						<POSTabs />
					)}
				</TaxesProvider>
			</OpenOrdersProvider>
		</OrdersProvider>
	);
};

export default POS;
