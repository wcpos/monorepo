import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';
import { map } from 'rxjs/operators';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import useLocalData from '../../../../contexts/local-data';
import { t } from '../../../../lib/translations';
import SyncButton from '../../components/sync-button';
import useProducts from '../../contexts/products';
import useCollection from '../../hooks/use-collection';

interface ProductFooterProps {
	count: number;
}

const ProductsFooter = ({ count }: ProductFooterProps) => {
	const theme = useTheme();
	const { store } = useLocalData();
	const { sync, clear, replicationState } = useProducts();
	const taxBasedOn = useObservableState(store.tax_based_on$, store.tax_based_on);
	const calcTaxes = useObservableState(store.calc_taxes$, store.calc_taxes);
	const active = useObservableState(replicationState ? replicationState.active$ : of(false), false);
	const collection = useCollection('products');
	const total = useObservableState(
		collection.getLocal$('audit-products').pipe(
			map((result) => {
				const data = result?.toJSON().data;
				return data?.remoteIDs ? data.remoteIDs.length : 0;
			})
		),
		0
	);

	/**
	 *
	 */
	let taxBasedOnLabel = t('Shop base address', { _tags: 'core' });
	if (taxBasedOn === 'billing') {
		taxBasedOnLabel = t('Customer billing address', { _tags: 'core' });
	}
	if (taxBasedOn === 'shipping') {
		taxBasedOnLabel = t('Customer shipping address', { _tags: 'core' });
	}

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
				<SyncButton sync={sync} clear={clear} active={active} />
			</Box>
		</Box>
	);
};

export default ProductsFooter;
