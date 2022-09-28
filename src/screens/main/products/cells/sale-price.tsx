import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/components/src/text';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
};

const RegularPrice = ({ item: product }: Props) => {
	const salePrice = useObservableState(product.sale_price$, product.sale_price);
	const { format } = useCurrencyFormat();

	if (!product.isSynced()) {
		return <Text.Skeleton length="short" />;
	}

	return salePrice ? <Text>{format(salePrice)}</Text> : null;
};

export default RegularPrice;
