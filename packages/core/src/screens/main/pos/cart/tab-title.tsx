import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';

interface Props {
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
export function CartTabTitle({ order }: Props) {
	const total = useObservableEagerState(order.total$!);
	const currencySymbol = useObservableEagerState(order.currency_symbol$!);
	const { format } = useCurrencyFormat({ currencySymbol: currencySymbol ?? '' });
	const t = useT();

	return <Text>{t('pos_cart.cart', { order_total: format(parseFloat(total ?? '0') || 0) })}</Text>;
}
