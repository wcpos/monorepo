import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Text from '@wcpos/components/src/text';

import useProducts from '../../../../../contexts/products';
import useStore from '../../../../../contexts/store';
import { t } from '../../../../../lib/translations';

interface ProductFooterProps {
	count: number;
}

const ProductsFooter = ({ count }: ProductFooterProps) => {
	const { storeDB } = useStore();
	const total = useObservableState(storeDB.products.count().$, 0);
	const theme = useTheme();
	const { sync } = useProducts();
	const [openMenu, setOpenMenu] = React.useState(false);

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
			<Dropdown
				opened={openMenu}
				onClose={() => {
					setOpenMenu(false);
				}}
				placement="top-end"
				items={[
					{ label: 'Sync', action: sync, icon: 'arrowRotateRight' },
					{
						label: 'Clear and Refresh',
						action: () => {
							console.log('clear');
						},
						type: 'critical',
						icon: 'trash',
					},
				]}
				trigger="longpress"
			>
				<Icon
					name="arrowRotateRight"
					size="small"
					onPress={sync}
					onLongPress={() => {
						setOpenMenu(true);
					}}
					tooltip="Press to sync products, long press for more options"
					tooltipPlacement="top-end"
				/>
			</Dropdown>
		</Box>
	);
};

export default ProductsFooter;
