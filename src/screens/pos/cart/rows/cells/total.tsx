import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import useCurrencyFormat from '@wcpos/common/src/hooks/use-currency-format';
import Text from '@wcpos/common/src/components/text';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';

interface Props {
	item:
		| import('@wcpos/common/src/database').LineItemDocument
		| import('@wcpos/common/src/database').FeeLineDocument
		| import('@wcpos/common/src/database').ShippingLineDocument;
	type?: 'total' | 'subtotal';
}

const Total = ({ item, type = 'total' }: Props) => {
	const total = useObservableState(item[`${type}$`], item[type]);
	const { format } = useCurrencyFormat();
	useWhyDidYouUpdate('CartLineItemTotal', { item, total });

	return <Text>{format(total || 0)}</Text>;
};

export default Total;
