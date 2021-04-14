import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/common/src/components/text';

interface Props {
	item?:
		| import('@wcpos/common/src/database').LineItemDocument
		| import('@wcpos/common/src/database').FeeLineDocument
		| import('@wcpos/common/src/database').ShippingLineDocument;
	total: string;
}

const Total = ({ item }: Props) => {
	// @ts-ignore
	const total = useObservableState(item.total$, item.total);
	console.log(total);

	return <Text>{total}</Text>;
};

export default Total;
