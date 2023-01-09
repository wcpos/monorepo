import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';
import Popover, { usePopover } from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';

import useProducts from '../../../../contexts/products';
import useStore from '../../../../contexts/store';
import { t } from '../../../../lib/translations';

interface ProductFooterProps {
	count: number;
}

const ProductsFooter = ({ count }: ProductFooterProps) => {
	const { storeDB } = useStore();
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
			<Text size="small">{t('Showing {count} of {total}', { count, total, _tags: 'core' })}</Text>
			<Popover content={<Text>hi</Text>} placement="top">
				<Icon name="arrowRotateRight" size="small" onPress={sync} onLongPress={open} />
			</Popover>
		</Box>
	);
};

export default ProductsFooter;
