import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { useTheme } from 'styled-components/native';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import POSColumns from './columns';
import POSTabs from './tabs';
import { useQuery } from '../../../contexts/store-state-manager';
import useBaseTaxLocation from '../hooks/use-base-tax-location';

/**
 * Tax query depends on store.tax_based_on, if customer also depends on currentOrder
 */
const POS = () => {
	const theme = useTheme();
	const dimensions = useWindowDimensions();
	const location = useBaseTaxLocation();

	/**
	 * TODO: why here
	 */
	// useQuery({
	// 	queryKeys: ['products'],
	// 	collectionName: 'products',
	// 	initialQuery: {
	// 		// sortBy: uiSettings.get('sortBy'),
	// 		// sortDirection: uiSettings.get('sortDirection'),
	// 	},
	// });

	return (
		<ErrorBoundary>
			<Suspense>{dimensions.width >= theme.screens.small ? <POSColumns /> : <POSTabs />}</Suspense>
		</ErrorBoundary>
	);
};

export default POS;
