import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';

import useCurrencyFormat from '../../../hooks/use-currency-format';

interface Props {
	item:
		| import('@wcpos/database').LineItemDocument
		| import('@wcpos/database').FeeLineDocument
		| import('@wcpos/database').ShippingLineDocument;
	type?: 'total' | 'subtotal';
}

export const Total = ({ item, type = 'total' }: Props) => {
	const total = useObservableState(item[`${type}$`], item[type]);
	const { format } = useCurrencyFormat();
	useWhyDidYouUpdate('CartLineItemTotal', { item, total });

	return <Text>{format(total || 0)}</Text>;
};
