import * as React from 'react';
import { useTheme } from 'styled-components/native';
import { useObservableState } from 'observable-hooks';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import Icon from '@wcpos/components/src/icon';
import useStore from '@wcpos/hooks/src/use-store';

interface ProductFooterProps {
	count: number;
}

/**
 *
 */
const ProductsFooter = ({ count }: ProductFooterProps) => {
	const { storeDB } = useStore();
	const total = useObservableState(storeDB.products.totalDocCount$, 0);
	const theme = useTheme();

	/**
	 *
	 */
	const handleClear = React.useCallback(() => {
		Promise.all([storeDB?.products.remove(), storeDB?.variations.remove()]).then(() => {
			console.log('Products cleared');
		});
	}, [storeDB?.products, storeDB?.variations]);

	/**
	 *
	 */
	return (
		<Box
			horizontal
			padding="small"
			space="xSmall"
			align="center"
			distribution="end"
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
			<Icon name="arrowRotateRight" size="small" onLongPress={handleClear} />
		</Box>
	);
};

export default ProductsFooter;
