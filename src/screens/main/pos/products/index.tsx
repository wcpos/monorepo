import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import SimpleProductTableRow from './rows/simple';
import VariableProductTableRow from './rows/variable';
import { useAppState } from '../../../../contexts/app-state';
import { useQuery, useStoreStateManager } from '../../../../contexts/store-state-manager';
import { t } from '../../../../lib/translations';
import DataTable from '../../components/data-table';
import FilterBar from '../../components/product/filter-bar';
import Search from '../../components/product/search';
import TaxBasedOn from '../../components/product/tax-based-on';
import UISettings from '../../components/ui-settings';
import useUI from '../../contexts/ui-settings';
import useCurrentOrder from '../contexts/current-order';

type ProductDocument = import('@wcpos/database').ProductDocument;

// Table Rows
const TABLE_ROW_COMPONENTS = {
	simple: SimpleProductTableRow,
	variable: VariableProductTableRow,
};

/**
 *
 */
const POSProducts = ({ isColumn = false }) => {
	const theme = useTheme();
	const { uiSettings } = useUI('pos.products');
	const { addProduct, addVariation } = useCurrentOrder();
	const showOutOfStock = useObservableState(
		uiSettings.get$('showOutOfStock'),
		uiSettings.get('showOutOfStock')
	);
	const { store } = useAppState();
	const calcTaxes = useObservableState(store.calc_taxes$, store.calc_taxes);
	const taxBasedOn = useObservableState(store.tax_based_on$, store?.tax_based_on);

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['products', { target: 'pos' }],
		collectionName: 'products',
		initialQuery: {
			sortBy: uiSettings.get('sortBy'),
			sortDirection: uiSettings.get('sortDirection'),
		},
	});

	/**
	 *
	 */
	const manager = useStoreStateManager();
	const taxQuery = manager.getQuery(['tax-rates', 'pos']);

	/**
	 *
	 */
	React.useEffect(() => {
		query.where('stock_status', showOutOfStock ? undefined : 'instock');
	}, [query, showOutOfStock]);

	/**
	 *
	 */
	const renderItem = React.useCallback((props) => {
		let Component = TABLE_ROW_COMPONENTS[props.item.type];

		// If we still didn't find a component, use SimpleProductTableRow as a fallback
		// eg: Grouped products
		if (!Component) {
			Component = SimpleProductTableRow;
		}

		return (
			<ErrorBoundary>
				<Component {...props} />
			</ErrorBoundary>
		);
	}, []);

	/**
	 *
	 */
	return (
		<Box padding="small" paddingRight={isColumn ? 'none' : 'small'} style={{ height: '100%' }}>
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
					<ErrorBoundary>
						<Box fill space="small">
							<Box horizontal align="center" padding="small" paddingBottom="none" space="small">
								<ErrorBoundary>
									<Search query={query} addProduct={addProduct} addVariation={addVariation} />
								</ErrorBoundary>
								<ErrorBoundary>
									<UISettings
										uiSettings={uiSettings}
										title={t('Product Settings', { _tags: 'core' })}
									/>
								</ErrorBoundary>
							</Box>
							<Box horizontal padding="small" paddingTop="none">
								<ErrorBoundary>
									<FilterBar query={query} />
								</ErrorBoundary>
							</Box>
						</Box>
					</ErrorBoundary>
				</Box>
				<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
					<ErrorBoundary>
						<Suspense>
							<DataTable<ProductDocument>
								query={query}
								uiSettings={uiSettings}
								renderItem={renderItem}
								noDataMessage={t('No products found', { _tags: 'core' })}
								estimatedItemSize={100}
								extraContext={{ taxLocation: 'pos' }}
								footer={
									calcTaxes === 'yes' && (
										<Box fill padding="small" space="xSmall" horizontal>
											<TaxBasedOn query={taxQuery} taxBasedOn={taxBasedOn} />
										</Box>
									)
								}
							/>
						</Suspense>
					</ErrorBoundary>
				</Box>
			</Box>
		</Box>
	);
};

// export default React.memo(POSProducts); // caches translations
export default POSProducts;
