import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/components/src/text';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';
import useAuth from '@wcpos/hooks/src/use-auth';
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
	const { store } = useAuth();
	const taxDisplayShop = useObservableState(store?.tax_display_shop$, store?.tax_display_shop);
	const { display } = column;
	const { getDisplayValues } = useTaxes();
	let displayPrice = price;
	let taxTotal = 0;

	if (tax_status === 'taxable') {
		const result = getDisplayValues(price, tax_class, taxDisplayShop);
		displayPrice = result.displayPrice;
		taxTotal = result.taxTotal;
	}

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
					{`${taxDisplayShop === 'incl' ? 'incl.' : 'excl.'} ${format(taxTotal)} tax`}
				</Text>
			)}
		</>
	) : (
		<Text.Skeleton length="short" />
	);
};

export default Price;
