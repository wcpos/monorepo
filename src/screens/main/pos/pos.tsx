import * as React from 'react';
import { useTheme } from 'styled-components/native';
import { useObservableSuspense } from 'observable-hooks';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import useStore from '@wcpos/hooks/src/use-store';
import { TaxesProvider } from '@wcpos/core/src/contexts/taxes';
import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import ResizeableColumns from './resizable-columns';
import POSTabs from './tabs';
import POSContextProvider from './context';

/**
 *
 */
const POS = () => {
	const { storeDB, uiResources } = useStore();
	const productsUI = useObservableSuspense(uiResources['pos.products']);
	const theme = useTheme();
	console.log('render POS');

	/**
	 * TODO: useWindowDimensions updates state which triggers re-rendering of the whole POS
	 * Is there a way to use a reanimated shared value or similar?
	 */

	useWhyDidYouUpdate('POS', {
		productsUI,
		// openOrdersResource,
		theme,
		storeDB,
	});

	return (
		<POSContextProvider>
			<TaxesProvider>
				{theme._dimensions.width >= theme.screens.small ? (
					<ResizeableColumns ui={productsUI} />
				) : (
					<POSTabs />
				)}
			</TaxesProvider>
		</POSContextProvider>
	);
};

export default POS;
