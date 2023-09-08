import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import { useT } from '../../../../../contexts/translations';
import useCurrencyFormat from '../../../hooks/use-currency-format';

interface CheckoutTitleProps {
	order: import('@wcpos/database').OrderDocument;
}

const CheckoutTitle = ({ order }: CheckoutTitleProps) => {
	const { format } = useCurrencyFormat();
	const total = useObservableState(order.total$, order.total);
	const t = useT();

	if (!order) {
		throw new Error('Order not found');
	}

	return (
		<Text size="large" align="center" weight="bold">
			{t('Amount to Pay', { _tags: 'core' })}
			{`: ${format(total || 0)}`}
		</Text>
	);
};

export default CheckoutTitle;
