import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/common/src/components/text';

interface Props {
	item:
		| import('@wcpos/common/src/database').LineItemDocument
		| import('@wcpos/common/src/database').FeeLineDocument
		| import('@wcpos/common/src/database').ShippingLineDocument;
	type?: 'totalTax' | 'subtotalTax';
}

const Tax = ({ item, type = 'totalTax' }: Props) => {
	const tax = useObservableState(item[`${type}$`], item[type]);
	return <Text>{tax}</Text>;
};

export default Tax;
