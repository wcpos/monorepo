import * as React from 'react';

import find from 'lodash/find';
import { useObservableEagerState } from 'observable-hooks';

import { useDataTable, CellContext } from '@wcpos/tailwind/src/data-table';

import PriceWithTax from '../../components/product/price';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
const Price = ({ row, column }: CellContext<ProductDocument, 'price'>) => {
	const product = row.original;
	const price = useObservableEagerState(product.price$);
	const taxStatus = useObservableEagerState(product.tax_status$);
	const taxClass = useObservableEagerState(product.tax_class$);
	const { display } = column;
	const context = useDataTable();

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
	 *
	 */
	return (
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
