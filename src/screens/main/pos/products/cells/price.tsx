import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import { useTable } from '@wcpos/components/src/table';

import PriceWithTax from '../../../components/product/price';

interface Props {
	item: import('@wcpos/database').ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
}

export const Price = ({ item: product, column }: Props) => {
	const price = useObservableState(product.price$, product.price);
	const regular_price = useObservableState(product.regular_price$, product.regular_price);
	const taxStatus = useObservableState(product.tax_status$, product.tax_status);
	const taxClass = useObservableState(product.tax_class$, product.tax_class);
	const { display } = column;
	const context = useTable();

	/**
	 * TODO - move this into the ui as a helper function
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	const showRegularPrice = show('on_sale') && parseFloat(price) !== parseFloat(regular_price);

	/**
	 *
	 */
	return showRegularPrice ? (
		<Box space="xSmall" align="end">
			<PriceWithTax
				price={regular_price}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={show('tax') ? 'text' : 'tooltip'}
				taxLocation={context?.taxLocation}
				strikethrough
			/>
			<PriceWithTax
				price={price}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={show('tax') ? 'text' : 'tooltip'}
				taxLocation={context?.taxLocation}
			/>
		</Box>
	) : (
		<PriceWithTax
			price={price}
			taxStatus={taxStatus}
			taxClass={taxClass}
			taxDisplay={show('tax') ? 'text' : 'tooltip'}
			taxLocation={context?.taxLocation}
		/>
	);
};

export default Price;
