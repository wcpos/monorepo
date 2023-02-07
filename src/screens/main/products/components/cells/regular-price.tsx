import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import PriceWithTax from '../../../components/product/price';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
};

const RegularPrice = ({ item: product, column }: Props) => {
	const price = useObservableState(product.regular_price$, product.regular_price);
	const taxStatus = useObservableState(product.tax_status$, product.tax_status);
	const taxClass = useObservableState(product.tax_class$, product.tax_class);
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

	/**
	 * Early exit, no price!
	 */
	if (!price) {
		return null;
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

export default RegularPrice;
