import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';
import { map } from 'rxjs/operators';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import useLocalData from '../../../../contexts/local-data';
import { t } from '../../../../lib/translations';
import TaxBasedOn from '../../components/product/tax-based-on';
import SyncButton from '../../components/sync-button';
import useProducts from '../../contexts/products';
import useTotalCount from '../../hooks/use-total-count';

interface ProductFooterProps {
	count: number;
}

/**
 *
 */
const ProductsFooter = ({ count }: ProductFooterProps) => {
	const { storeDB, store } = useLocalData();
	// const total = useObservableState(storeDB.products.count().$, 0);
	const theme = useTheme();
	const { sync, clear, replicationState } = useProducts();
	const calcTaxes = useObservableState(store.calc_taxes$, store.calc_taxes);
	const active = useObservableState(replicationState ? replicationState.active$ : of(false), false);
	const total = useTotalCount('products');

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
			{calcTaxes === 'yes' ? (
				<Box fill padding="small" space="xSmall" horizontal>
					<TaxBasedOn />
				</Box>
			) : (
				<Box fill />
			)}
			<Box fill horizontal padding="small" space="xSmall" align="center" distribution="end">
				<Text size="small">{t('Showing {count} of {total}', { count, total, _tags: 'core' })}</Text>
				<SyncButton sync={sync} clear={clear} active={active} />
			</Box>
		</Box>
	);
};

export default ProductsFooter;
