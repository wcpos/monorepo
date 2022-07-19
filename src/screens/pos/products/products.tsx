import * as React from 'react';
import { ProductsProvider } from '@wcpos/hooks/src/use-products';
import { useTheme } from 'styled-components/native';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import Table from './table';
import SearchBar from './search-bar';
import Settings from './settings';

interface POSProductsProps {
	ui: import('@wcpos/hooks/src/use-ui-resource').UIDocument;
}

/**
 *
 */
const POSProducts = ({ ui }: POSProductsProps) => {
	const theme = useTheme();
	const initialQuery = React.useMemo(() => ({ sortBy: 'name', sortDirection: 'asc' }), []);

	return (
		<ProductsProvider initialQuery={initialQuery} ui={ui}>
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
					errorBoundary
				>
					<SearchBar />
					<Settings ui={ui} />
				</Box>
				<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }} errorBoundary>
					<React.Suspense fallback={<Text>Loading products...</Text>}>
						<Table ui={ui} />
					</React.Suspense>
				</Box>
			</Box>
		</ProductsProvider>
	);
};

export default React.memo(POSProducts);
