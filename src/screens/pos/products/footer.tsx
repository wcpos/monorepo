import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/components/src/text';
import useAppState from '@wcpos/hooks/src/use-app-state';
import Box from '@wcpos/components/src/box';

interface ProductFooterProps {
	count: number;
}

const ProductsFooter = ({ count }: ProductFooterProps) => {
	const { storeDB } = useAppState();
	const total = useObservableState(storeDB.products.totalDocCount$, 0);

	return (
		<Box padding="small" align="end">
			<Text>
				{count} of {total}
			</Text>
		</Box>
	);
};

export default ProductsFooter;
