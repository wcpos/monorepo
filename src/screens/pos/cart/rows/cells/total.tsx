import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Format from '@wcpos/common/src/components/format';
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
	useWhyDidYouUpdate('CartLineItemTotal', { item, total });

	return <Format.Currency>{total}</Format.Currency>;
};

export default Total;
