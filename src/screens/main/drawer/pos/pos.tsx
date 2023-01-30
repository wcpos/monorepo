import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { useTheme } from 'styled-components/native';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import POSColumns from './columns';
import { CurrentOrderProvider } from './contexts/current-order';
import POSTabs from './tabs';
import { TaxesProvider } from '../../../../contexts/taxes';

const POS = ({ navigation, route }) => {
	const theme = useTheme();
	const dimensions = useWindowDimensions();
	const { orderID } = route.params || {};

	const taxQuery = React.useMemo(() => ({ country: 'GB' }), []);

	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>Loading POS...</Text>}>
				<CurrentOrderProvider orderID={orderID}>
					<TaxesProvider initialQuery={taxQuery}>
						{dimensions.width >= theme.screens.small ? <POSColumns /> : <POSTabs />}
					</TaxesProvider>
				</CurrentOrderProvider>
			</React.Suspense>
		</ErrorBoundary>
	);
};

export default POS;
