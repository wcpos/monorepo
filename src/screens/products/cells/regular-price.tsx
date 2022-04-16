import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/components/src/text';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
};

const RegularPrice = ({ item: product }: Props) => {
	const regularPrice = useObservableState(product.regular_price$, product.regular_price);
	const { format } = useCurrencyFormat();

	return regularPrice ? <Text>{format(regularPrice || 0)}</Text> : <Text.Skeleton length="short" />;
};

export default RegularPrice;
