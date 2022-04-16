import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/components/src/text';

interface Props {
	item:
		| import('@wcpos/database').LineItemDocument
		| import('@wcpos/database').FeeLineDocument
		| import('@wcpos/database').ShippingLineDocument;
	type?: 'totalTax' | 'subtotalTax';
}

const Tax = ({ item, type = 'totalTax' }: Props) => {
	const tax = useObservableState(item[`${type}$`], item[type]);
	return <Text>{tax}</Text>;
};

export default Tax;
