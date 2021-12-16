import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/common/src/components/text';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Box from '@wcpos/common/src/components/box';
import * as Styled from './styles';

interface ProductFooterProps {
	count: number;
}

const ProductsFooter = ({ count }: ProductFooterProps) => {
	const { storeDB } = useAppState();
	const total = useObservableState(storeDB.products.totalDocuments$, 0);

	return (
		<Box padding="small" align="end">
			<Text>
				{count} of {total}
			</Text>
		</Box>
	);
};

export default ProductsFooter;
