import * as React from 'react';
import { ProductsProvider } from '@wcpos/hooks/src/use-products';
import { useTheme } from 'styled-components/native';
import Box from '@wcpos/components/src/box';
import UiSettings from '../../common/ui-settings';
import Table from './table';
import SearchBar from './search-bar';

interface POSProductsProps {
	ui: import('@wcpos/hooks/src/use-ui-resource').UIDocument;
}

/**
 *
 */
const POSProducts = ({ ui }: POSProductsProps) => {
	const theme = useTheme();

	return (
		<ProductsProvider initialQuery={{ sortBy: 'name', sortDirection: 'asc' }}>
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
					<UiSettings ui={ui} />
				</Box>
				<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
					<Table ui={ui} />
				</Box>
			</Box>
		</ProductsProvider>
	);
};

export default POSProducts;
