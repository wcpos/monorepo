import * as React from 'react';
import Text from '@wcpos/common/src/components/text';
import Format from '@wcpos/common/src/components/format';
import useAppState from '@wcpos/common/src/hooks/use-app-state';

type PriceProps = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const Price = ({ item: product }: PriceProps) => {
	const { store } = useAppState();

	return product.isSynced() ? (
		<Format.Number prefix={store.price_decimal_sep}>{product.price}</Format.Number>
	) : (
		<Text.Skeleton length="short" />
	);
};

export default Price;
