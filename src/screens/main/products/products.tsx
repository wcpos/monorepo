import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import SearchBar from './components/search-bar';
import Table from './components/table';
import useAuth from '../../../contexts/auth';
import { t } from '../../../lib/translations';
import UiSettings from '../components/ui-settings';
import { ProductsProvider } from '../contexts/products';
import { TaxesProvider } from '../contexts/taxes';
import useUI from '../contexts/ui-settings';

/**
 *
 */
const Products = () => {
	const { uiSettings } = useUI('products');
	const theme = useTheme();
	const { store } = useAuth();

	const initialQueryResource = React.useMemo(() => {
		return new ObservableResource(
			combineLatest([store.store_city$, store.default_country$, store.store_postcode$]).pipe(
				map(([city = '', defaultCountry = '', postcode = '']) => {
					/**
					 * default_country has a weird format, eg: US:CA
					 */
					const [country, state] = defaultCountry.split(':');
					return { city, country, state, postcode };
				})
			)
		);
	}, [store.default_country$, store.store_city$, store.store_postcode$]);

	return (
		<TaxesProvider initialQueryResource={initialQueryResource}>
			<ProductsProvider
				initialQuery={{
					sortBy: uiSettings.get('sortBy'),
					sortDirection: uiSettings.get('sortDirection'),
				}}
				uiSettings={uiSettings}
			>
				<Box padding="small" style={{ height: '100%' }}>
					<Box
						raised
						rounding="medium"
						style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
					>
						<Box
							horizontal
							space="small"
							padding="small"
							align="center"
							style={{
								backgroundColor: theme.colors.grey,
								borderTopLeftRadius: theme.rounding.medium,
								borderTopRightRadius: theme.rounding.medium,
							}}
						>
							<SearchBar />
							<UiSettings
								uiSettings={uiSettings}
								title={t('Product Settings', { _tags: 'core' })}
							/>
						</Box>
						<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
							<React.Suspense fallback={<Text>Loading products table...</Text>}>
								<Table uiSettings={uiSettings} />
							</React.Suspense>
						</Box>
					</Box>
				</Box>
			</ProductsProvider>
		</TaxesProvider>
	);
};

export default Products;
