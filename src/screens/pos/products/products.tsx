import * as React from 'react';
import useIdAudit from '@wcpos/hooks/src/use-id-audit';
import useRestQuery from '@wcpos/hooks/src/use-rest-query';
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
	// useIdAudit('products');
	// useRestQuery('products');

	return (
		<Box
			raised
			rounding="medium"
			style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
		>
			<Box horizontal space="small" padding="small" align="center">
				<SearchBar />
				<UiSettings ui={ui} />
			</Box>
			<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
				<Table ui={ui} />
			</Box>
		</Box>
	);
};

export default POSProducts;
