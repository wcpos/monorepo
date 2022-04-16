import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/components/src/text';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';

type Props = {
	item: import('@wcpos/database').OrderDocument;
};

const Total = ({ item: order }: Props) => {
	const total = useObservableState(order.total$, order.total);
	const { format } = useCurrencyFormat();

	return total ? <Text>{format(total || 0)}</Text> : <Text.Skeleton length="short" />;
};

export default Total;
