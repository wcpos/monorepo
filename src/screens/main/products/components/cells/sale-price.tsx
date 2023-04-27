import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import NumberInput from '../../../components/number-input';

type ProductDocument = import('@wcpos/database').ProductDocument;

type Props = {
	item: ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<ProductDocument>;
	onChange: (product: ProductDocument, data: Record<string, unknown>) => void;
};

const SalePrice = ({ item: product, column, onChange }: Props) => {
	const sale_price = useObservableState(product.sale_price$, product.sale_price);
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
	 *
	 */
	return (
		<NumberInput
			value={sale_price || '0'}
			onChange={(sale_price) => onChange(product, { sale_price })}
			disabled={!product.on_sale}
			showDecimals
		/>
	);
};

export default SalePrice;
