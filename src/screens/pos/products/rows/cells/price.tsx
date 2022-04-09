import * as React from 'react';
import Text from '@wcpos/common/src/components/text';
import FormatNumber from '@wcpos/common/src/components/format-number';
import useAppState from '@wcpos/common/src/hooks/use-app-state';

type PriceProps = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const Price = ({ item: product }: PriceProps) => {
	const { store } = useAppState();

	return product.isSynced() ? (
		<FormatNumber
			value={product.price || 0}
			currency="$"
			currencyPosition={store?.currency_pos}
			decimalSeparator={store?.price_decimal_sep}
			decimalPrecision={store?.price_num_decimals}
			fixedDecimalPrecision
			isNumericString
		/>
	) : (
		<Text.Skeleton length="short" />
	);
};

export default Price;
