import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import NumberInput from '../../../components/number-input';
import PriceWithTax from '../../../components/product/price';
import useCurrencyFormat from '../../../hooks/use-currency-format';

type ProductDocument = import('@wcpos/database').ProductDocument;

type Props = {
	item: ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<ProductDocument>;
	onChange: (product: ProductDocument, data: Record<string, unknown>) => void;
};

const RegularPrice = ({ item: product, column, onChange }: Props) => {
	const regular_price = useObservableState(product.regular_price$, product.regular_price);
	// const taxStatus = useObservableState(product.tax_status$, product.tax_status);
	// const taxClass = useObservableState(product.tax_class$, product.tax_class);
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
			value={regular_price || '0'}
			onChange={(regular_price) => onChange(product, { regular_price })}
			showDecimals
		/>
	);
};

export default RegularPrice;
