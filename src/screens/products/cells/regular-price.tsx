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

	if (!product.isSynced()) {
		return <Text.Skeleton length="short" />;
	}

	return regularPrice ? <Text>{format(regularPrice || 0)}</Text> : null;
};

export default RegularPrice;
