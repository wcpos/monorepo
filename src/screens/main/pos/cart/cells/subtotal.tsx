import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import useCurrencyFormat from '../../../hooks/use-currency-format';

interface Props {
	item:
		| import('@wcpos/database').LineItemDocument
		| import('@wcpos/database').FeeLineDocument
		| import('@wcpos/database').ShippingLineDocument;
}

export const Subtotal = ({ item }: Props) => {
	const subtotal = useObservableState(item.subtotal$, item.subtotal);
	const { format } = useCurrencyFormat();

	return <Text>{format(subtotal || 0)}</Text>;
};
