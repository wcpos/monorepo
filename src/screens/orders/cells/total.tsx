import * as React from 'react';
import Text from '@wcpos/common/src/components/text';

type Props = {
	item: import('@wcpos/common/src/database').OrderDocument;
};

const Total = ({ item: order }: Props) => {
	return order.total ? <Text>{order.total}</Text> : <Text.Skeleton length="short" />;
};

export default Total;
