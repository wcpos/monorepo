import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/components/src/text';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';
import useTaxes from '@wcpos/core/src/contexts/taxes';
import find from 'lodash/find';

interface Props {
	item: import('@wcpos/database').ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
}

export const Price = ({ item: product, column }: Props) => {
	const { format } = useCurrencyFormat();
	const price = useObservableState(product.price$, product.price);
	const tax_status = useObservableState(product.tax_status$, product.tax_status);
	const tax_class = useObservableState(product.tax_class$, product.tax_class);
	// const { calcTaxes } = useTaxes();
	const displayPrice = price;
	const taxTotal = 0;
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
			<Text>{format(displayPrice)}</Text>
			{show('tax') && tax_status === 'taxable' && (
				<Text type="textMuted" size="small">
					{`${format(taxTotal)} tax`}
				</Text>
			)}
		</>
	) : (
		<Text.Skeleton length="short" />
	);
};

export default Price;
