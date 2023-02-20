import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import useStore from '../../../../contexts/store';
import { t } from '../../../../lib/translations';
import SyncButton from '../../components/sync-button';
import useProducts from '../../contexts/products';

interface ProductFooterProps {
	count: number;
}

/**
 *
 */
const ProductsFooter = ({ count }: ProductFooterProps) => {
	const { storeDB } = useStore();
	const total = useObservableState(storeDB.products.count().$, 0);
	const theme = useTheme();
	const { sync, clear } = useProducts();

	return (
		<Box
			horizontal
			style={{
				width: '100%',
				backgroundColor: theme.colors.lightGrey,
				borderBottomLeftRadius: theme.rounding.medium,
				borderBottomRightRadius: theme.rounding.medium,
				borderTopWidth: 1,
				borderTopColor: theme.colors.grey,
			}}
		>
			<Box fill padding="small" space="xSmall">
				<Text size="small">
					{t('Tax based on', { _tags: 'core' })}: {t('Shop base address', { _tags: 'core' })}
				</Text>
			</Box>
			<Box fill horizontal padding="small" space="xSmall" align="center" distribution="end">
				<Text size="small">{t('Showing {count} of {total}', { count, total, _tags: 'core' })}</Text>
				<SyncButton sync={sync} clear={clear} />
			</Box>
		</Box>
	);
};

export default ProductsFooter;
