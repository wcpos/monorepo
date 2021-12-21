import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/common/src/components/text';

interface Props {
	item: import('@wcpos/common/src/database').ShippingLineDocument;
}

const ShippingTitle = ({ item }: Props) => {
	const methodTitle = useObservableState(item.methodTitle$, item.methodTitle);
	return <Text>{methodTitle}</Text>;
};

export default ShippingTitle;
