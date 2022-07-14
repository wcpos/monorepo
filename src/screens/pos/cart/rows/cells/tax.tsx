import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/components/src/text';

interface Props {
	item:
		| import('@wcpos/database').LineItemDocument
		| import('@wcpos/database').FeeLineDocument
		| import('@wcpos/database').ShippingLineDocument;
	type?: 'total_tax' | 'subtotal_tax';
}

const Tax = ({ item, type = 'total_tax' }: Props) => {
	const tax = useObservableState(item[`${type}$`], item[type]);
	return <Text>{tax}</Text>;
};

export default Tax;
