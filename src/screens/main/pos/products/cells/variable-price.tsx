import * as React from 'react';
import { useObservableState, ObservableResource, useObservableSuspense } from 'observable-hooks';
import Text from '@wcpos/components/src/text';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';
import useVariations from '@wcpos/core/src/contexts/variations';
import useTaxes from '@wcpos/core/src/contexts/taxes';
import find from 'lodash/find';

interface Props {
	item: import('@wcpos/database').ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
}

export const VariablePrice = ({ item: product, column }: Props) => {
	const { format } = useCurrencyFormat();
	const { data } = useVariations();

	const priceRange = React.useMemo(() => {
		const prices = data.map((variation) => variation.price);
		if (prices.length > 0) {
			const min = Math.min(...prices);
			const max = Math.max(...prices);
			return min === max ? [max] : [min, max];
		}
		return [];
	}, [data]);

	const variationsSynced = React.useMemo(() => {
		return product.isSynced() && data.length > 0 && data.every((variation) => variation.isSynced());
	}, [product, data]);

	const { display } = column;

	/**
	 *
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	if (!variationsSynced) {
		<Text.Skeleton length="short" />;
	}

	return <Text>{priceRange}</Text>;
};

export default VariablePrice;
