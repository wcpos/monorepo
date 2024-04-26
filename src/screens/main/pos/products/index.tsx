import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Text from '@wcpos/components/src/text';
import { useRelationalQuery } from '@wcpos/query';
import log from '@wcpos/utils/src/logger';

import SimpleProductTableRow from './rows/simple';
import VariableProductTableRow from './rows/variable';
import { useBarcode } from './use-barcode';
import { useT } from '../../../../contexts/translations';
import DataTable from '../../components/data-table';
import FilterBar from '../../components/product/filter-bar';
import Search from '../../components/product/search';
import TaxBasedOn from '../../components/product/tax-based-on';
import UISettings from '../../components/ui-settings';
import { useTaxRates } from '../../contexts/tax-rates';
import { useUISettings } from '../../contexts/ui-settings';
import { useAddProduct } from '../hooks/use-add-product';
import { useAddVariation } from '../hooks/use-add-variation';

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
	const { uiSettings } = useUISettings('pos-products');
	const { addProduct } = useAddProduct();
	const { addVariation } = useAddVariation();
	const { calcTaxes } = useTaxRates();
	const showOutOfStock = useObservableEagerState(uiSettings.showOutOfStock$);
	const t = useT();

	/**
	 *
	 */
	const { parentQuery: query } = useRelationalQuery(
		{
			queryKeys: ['products', { target: 'pos', type: 'relational' }],
			collectionName: 'products',
			initialParams: {
				sortBy: uiSettings.sortBy,
				sortDirection: uiSettings.sortDirection,
			},
		},
		{
			queryKeys: ['variations', { target: 'pos', type: 'relational' }],
			collectionName: 'variations',
			initialParams: {
				sortBy: 'id',
				sortDirection: uiSettings.sortDirection,
			},
			endpoint: 'products/variations',
			greedy: true,
		}
	);

	/**
	 * Barcode
	 */
	useBarcode(query);

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
		let Component = TABLE_ROW_COMPONENTS[props.item.document.type];

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
								id="pos-products"
								query={query}
								renderItem={renderItem}
								noDataMessage={t('No products found', { _tags: 'core' })}
								estimatedItemSize={100}
								extraContext={{ taxLocation: 'pos' }}
								footer={
									calcTaxes && (
										<Box fill padding="small" space="xSmall" horizontal>
											<TaxBasedOn />
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

export default POSProducts;
