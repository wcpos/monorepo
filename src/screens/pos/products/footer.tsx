import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';
import Text from '@wcpos/components/src/text';
import useAppState from '@wcpos/hooks/src/use-app-state';
import useProducts from '@wcpos/hooks/src/use-products';
import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';
import Popover, { usePopover } from '@wcpos/components/src/popover';

interface ProductFooterProps {
	count: number;
}

const ProductsFooter = ({ count }: ProductFooterProps) => {
	const { storeDB } = useAppState();
	const total = useObservableState(storeDB.products.totalDocCount$, 0);
	const theme = useTheme();
	const { sync } = useProducts();
	const { ref, open, close } = usePopover();

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
			<Popover content={<Text>hi</Text>} placement="top">
				<Icon name="arrowRotateRight" size="small" onPress={sync} onLongPress={open} />
			</Popover>
		</Box>
	);
};

export default ProductsFooter;
