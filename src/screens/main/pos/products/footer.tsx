import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import useLocalData from '../../../../contexts/local-data';
import { t } from '../../../../lib/translations';
import SyncButton from '../../components/sync-button';
import useProducts from '../../contexts/products';

interface ProductFooterProps {
	count: number;
}

const ProductsFooter = ({ count }: ProductFooterProps) => {
	const { store, storeDB } = useLocalData();
	const total = useObservableState(storeDB.products.count().$, 0);
	const theme = useTheme();
	const { sync, clear, replicationState } = useProducts();
	const taxBasedOn = useObservableState(store.tax_based_on$, store.tax_based_on);
	const calcTaxes = useObservableState(store.calc_taxes$, store.calc_taxes);

	/**
	 * FIXME: this is a temporary hack, need to get the label from the API
	 */
	const taxBasedOnLabel = React.useMemo(() => {
		switch (taxBasedOn) {
			case 'shipping':
				return t('Customer shipping address', { _tags: 'core' });
			case 'billing':
				return t('Customer billing address', { _tags: 'core' });
			default:
				return t('Shop base address', { _tags: 'core' });
		}
	}, [taxBasedOn]);

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
				<Box fill padding="small" space="xSmall">
					<Text size="small">
						{t('Tax based on', { _tags: 'core' })}: {taxBasedOnLabel}
					</Text>
				</Box>
			) : (
				<Box fill />
			)}
			<Box horizontal padding="small" space="xSmall" align="center" distribution="end">
				<Text size="small">{t('Showing {count} of {total}', { count, total, _tags: 'core' })}</Text>
				<SyncButton sync={sync} clear={clear} active$={replicationState.active$} />
			</Box>
		</Box>
	);
};

export default ProductsFooter;
