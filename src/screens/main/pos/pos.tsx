import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { useTheme } from 'styled-components/native';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import POSColumns from './columns';
import POSTabs from './tabs';
import useTaxLocation from './use-tax-location';
import { Query } from '../contexts/query';
import { TaxRateProvider } from '../contexts/tax-rates';

/**
 * Tax query depends on store.tax_based_on, if customer also depends on currentOrder
 */
const POS = () => {
	const theme = useTheme();
	const dimensions = useWindowDimensions();
	const location = useTaxLocation();

	/**
	 *
	 */
	const query = React.useMemo(
		() =>
			new Query({
				search: location,
				sortBy: 'id',
				sortDirection: 'asc',
			}),
		[location]
	);

	return (
		<TaxRateProvider query={query}>
			<ErrorBoundary>
				<React.Suspense>
					{dimensions.width >= theme.screens.small ? <POSColumns /> : <POSTabs />}
				</React.Suspense>
			</ErrorBoundary>
		</TaxRateProvider>
	);
};

export default POS;
