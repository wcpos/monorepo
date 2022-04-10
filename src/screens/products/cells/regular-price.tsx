import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/common/src/components/text';
import useCurrencyFormat from '@wcpos/common/src/hooks/use-currency-format';

type Props = {
	item: import('@wcpos/common/src/database').CustomerDocument;
};

const RegularPrice = ({ item: product }: Props) => {
	const regularPrice = useObservableState(product.regular_price$, product.regular_price);
	const { format } = useCurrencyFormat();

	return regularPrice ? <Text>{format(regularPrice || 0)}</Text> : <Text.Skeleton length="short" />;
};

export default RegularPrice;
