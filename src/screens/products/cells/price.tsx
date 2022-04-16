import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/components/src/text';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
};

const Price = ({ item: product }: Props) => {
	const price = useObservableState(product.price$, product.price);
	const { format } = useCurrencyFormat();

	return <Text>{format(price || 0)}</Text>;
};

export default Price;
