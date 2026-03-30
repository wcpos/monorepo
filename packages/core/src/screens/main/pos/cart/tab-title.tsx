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
	const refunds = useObservableEagerState(order.refunds$!);
	const currencySymbol = useObservableEagerState(order.currency_symbol$!);
	const { format } = useCurrencyFormat({ currencySymbol: currencySymbol ?? '' });
	const t = useT();

	const refundTotal = React.useMemo(
		() => (refunds ?? []).reduce((sum, r) => sum + Math.abs(parseFloat(r.total || '0')), 0),
		[refunds]
	);
	const displayTotal = parseFloat(total ?? '0') - refundTotal;

	return <Text>{t('pos_cart.cart', { order_total: format(displayTotal || 0) })}</Text>;
}
