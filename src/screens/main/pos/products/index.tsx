import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import SearchBar from './search-bar';
import Table from './table';
import { ProductsProvider } from '../../contexts/products';
import { Query } from '../../contexts/query';
import useUI from '../../contexts/ui-settings';

type ProductCollection = import('@wcpos/database').ProductCollection;

// import BarcodeScanner from './barcode-scanner';

/**
 *
 */
const POSProducts = ({ isColumn = false }) => {
	const theme = useTheme();
	const { uiSettings } = useUI('pos.products');
	const showOutOfStock = useObservableState(
		uiSettings.get$('showOutOfStock'),
		uiSettings.get('showOutOfStock')
	);

	/**
	 *
	 */
	const query = React.useMemo(() => {
		const q = new Query<ProductCollection>({
			sortBy: uiSettings.get('sortBy'),
			sortDirection: uiSettings.get('sortDirection'),
		});

		if (!showOutOfStock) {
			// query.where...
			// q.selector.$and.push({
			// 	$or: [
			// 		{ manage_stock: false },
			// 		{ $and: [{ manage_stock: true }, { stock_quantity: { $gt: 0 } }] },
			// 	],
			// });
		}

		return q;
	}, [showOutOfStock, uiSettings]);

	return (
		<ProductsProvider query={query}>
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
							<SearchBar />
						</ErrorBoundary>
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
		</ProductsProvider>
	);
};

// export default React.memo(POSProducts); // caches translations
export default POSProducts;
