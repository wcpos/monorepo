import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/common/src/components/text';
import useCurrencyFormat from '@wcpos/common/src/hooks/use-currency-format';

type Props = {
	item: import('@wcpos/common/src/database').OrderDocument;
};

const Total = ({ item: order }: Props) => {
	const total = useObservableState(order.total$, order.total);
	const { format } = useCurrencyFormat();

	return total ? <Text>{format(total || 0)}</Text> : <Text.Skeleton length="short" />;
};

export default Total;
