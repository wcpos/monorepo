import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { useTheme } from 'styled-components/native';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';

import POSColumns from './columns';
import POSTabs from './tabs';

/**
 * Tax query depends on store.tax_based_on, if customer also depends on currentOrder
 */
const POS = () => {
	const theme = useTheme();
	const dimensions = useWindowDimensions();

	return (
		<ErrorBoundary>
			<Suspense>{dimensions.width >= theme.screens.small ? <POSColumns /> : <POSTabs />}</Suspense>
		</ErrorBoundary>
	);
};

export default POS;
