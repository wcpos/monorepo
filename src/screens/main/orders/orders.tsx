import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import FilterBar from './filter-bar';
import SearchBar from './search-bar';
import Table from './table';
import { t } from '../../../lib/translations';
import UiSettings from '../components/ui-settings';
import { OrdersProvider } from '../contexts/orders';
import useUI from '../contexts/ui-settings';

/**
 *
 */
const Orders = () => {
	const { uiSettings } = useUI('orders');
	const theme = useTheme();

	/**
	 *
	 */
	const initialQuery = React.useMemo(
		() => ({ sortBy: uiSettings.get('sortBy'), sortDirection: uiSettings.get('sortDirection') }),
		[uiSettings]
	);

	/**
	 *
	 */
	return (
		<OrdersProvider initialQuery={initialQuery}>
			<Box padding="small" style={{ height: '100%' }}>
				<Box
					raised
					rounding="medium"
					style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
				>
					<Box
						horizontal
						style={{
							backgroundColor: theme.colors.grey,
							borderTopLeftRadius: theme.rounding.medium,
							borderTopRightRadius: theme.rounding.medium,
						}}
					>
						<Box fill space="small">
							<Box
								horizontal
								align="center"
								padding="small"
								//paddingBottom="none"
								space="small"
							>
								<ErrorBoundary>
									<SearchBar />
								</ErrorBoundary>
								<ErrorBoundary>
									<UiSettings
										uiSettings={uiSettings}
										title={t('Order Settings', { _tags: 'core' })}
									/>
								</ErrorBoundary>
							</Box>
							{/* <Box horizontal padding="small" paddingTop="none">
								<FilterBar />
							</Box> */}
						</Box>
					</Box>
					<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
						<ErrorBoundary>
							<React.Suspense>
								<Table uiSettings={uiSettings} />
							</React.Suspense>
						</ErrorBoundary>
					</Box>
				</Box>
			</Box>
		</OrdersProvider>
	);
};

export default Orders;
