import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import PriceWithTax from '../../../common/price';

interface Props {
	item: import('@wcpos/database').ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
}

export const Price = ({ item: product, column }: Props) => {
	const price = useObservableState(product.price$, product.price);
	const taxStatus = useObservableState(product.tax_status$, product.tax_status);
	const taxClass = useObservableState(product.tax_class$, product.tax_class);
	const { display } = column;

	/**
	 * @TODO - move this into the ui as a helper function
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	/**
	 * Early exit, show skeleton if not downloaded yet
	 */
	if (!product.isSynced()) {
		return <Text.Skeleton length="short" />;
	}

	/**
	 *
	 */
	return (
		<PriceWithTax
			price={price}
			taxStatus={taxStatus}
			taxClass={taxClass}
			taxDisplay={show('tax') ? 'text' : 'tooltip'}
		/>
	);
};

export default Price;
