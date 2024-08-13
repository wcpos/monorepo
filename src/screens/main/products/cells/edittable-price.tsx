import * as React from 'react';

import find from 'lodash/find';
import { useObservableEagerState } from 'observable-hooks';

import { CellContext } from '@wcpos/tailwind/src/data-table';

import NumberInput from '../../components/number-input';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
const EdittablePrice = ({
	row,
	column,
}: CellContext<ProductDocument | ProductVariationDocument, 'sale_price' | 'regular_price'>) => {
	const item = row.original;
	const price = useObservableEagerState(item[`${column.id}$`]);
	const { display } = column.columnDef.meta;

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
		<NumberInput
			value={price || '0'}
			onChange={(price) => onChange(item, { [column.id]: price })}
			disabled={column.id === 'sale_price' && !item.on_sale}
			showDecimals
		/>
	);
};

export default EdittablePrice;
