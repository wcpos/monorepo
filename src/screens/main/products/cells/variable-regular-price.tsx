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

const VariablePrice = ({ item: product, column }: Props) => {
	const { format } = useCurrencyFormat();
	const { data } = useVariations();
	const priceRange = React.useMemo(() => {
		const prices = data.map((variation) => variation.regular_price);
		const min = Math.min(...prices);
		const max = Math.max(...prices);
		return `${format(min)} - ${format(max)}`;
	}, [data, format]);

	// const price = useObservableState(product.price$, product.price);
	// const tax_status = useObservableState(product.tax_status$, product.tax_status);
	// const tax_class = useObservableState(product.tax_class$, product.tax_class);
	// const { calcTaxes } = useTaxes();
	// let displayPrice = price;
	// let taxTotal = 0;
	// if (tax_status === 'taxable') {
	// 	const result = calcTaxes(price, tax_class);
	// 	displayPrice = result.displayPrice;
	// 	taxTotal = result.taxTotal;
	// }

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

	return product.isSynced() ? (
		<>
			<Text>{priceRange}</Text>
			{/* {show('tax') && tax_status === 'taxable' && (
				<Text type="textMuted" size="small">
					{`${format(taxTotal)} tax`}
				</Text>
			)} */}
		</>
	) : (
		<Text.Skeleton length="short" />
	);
};

export default VariablePrice;
