import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';
import Text from '@wcpos/components/src/text';
import useAppState from '@wcpos/hooks/src/use-app-state';
import Box from '@wcpos/components/src/box';

interface ProductFooterProps {
	count: number;
}

const ProductsFooter = ({ count }: ProductFooterProps) => {
	const { storeDB } = useAppState();
	const total = useObservableState(storeDB.products.totalDocCount$, 0);
	const theme = useTheme();

	return (
		<Box
			padding="small"
			align="end"
			style={{
				backgroundColor: theme.colors.lightGrey,
				borderBottomLeftRadius: theme.rounding.medium,
				borderBottomRightRadius: theme.rounding.medium,
				borderTopWidth: 1,
				borderTopColor: theme.colors.grey,
			}}
		>
			<Text size="small">
				Showing {count} of {total}
			</Text>
		</Box>
	);
};

export default ProductsFooter;
