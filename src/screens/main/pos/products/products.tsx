import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import log from '@wcpos/utils/src/logger';

import SearchBar from './search-bar';
import Settings from './settings';
import Table from './table';
import { ProductsProvider } from '../../../../contexts/products';
import useUI from '../../../../contexts/ui';

// import BarcodeScanner from './barcode-scanner';

/**
 *
 */
const POSProducts = ({ isColumn = false }) => {
	const theme = useTheme();
	const { ui } = useUI('pos.products');
	const initialQuery = React.useMemo(() => ({ sortBy: 'name', sortDirection: 'asc' }), []);
	log.debug('render POSProducts');

	useWhyDidYouUpdate('POSProducts', { isColumn, theme, ui, initialQuery });

	return (
		<ProductsProvider initialQuery={initialQuery} ui={ui}>
			<Box padding="small" paddingRight={isColumn ? 'none' : 'small'} style={{ height: '100%' }}>
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
						{/* <ErrorBoundary>
							<BarcodeScanner />
						</ErrorBoundary> */}
						<ErrorBoundary>
							<SearchBar />
						</ErrorBoundary>
						<ErrorBoundary>
							<Settings ui={ui} />
						</ErrorBoundary>
					</Box>
					<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
						<ErrorBoundary>
							<React.Suspense fallback={<Text>Loading products...</Text>}>
								<Table ui={ui} />
							</React.Suspense>
						</ErrorBoundary>
					</Box>
				</Box>
			</Box>
		</ProductsProvider>
	);
};

export default React.memo(POSProducts);
