import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import NumberInput from '../../../components/number-input';
import PriceWithTax from '../../../components/product/price';
import usePushDocument from '../../../contexts/use-push-document';
import useCurrencyFormat from '../../../hooks/use-currency-format';

type Props = {
	item: import('@wcpos/database').ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
};

const RegularPrice = ({ item: product, column }: Props) => {
	// const regular_price = useObservableState(product.regular_price$, product.regular_price);
	// const taxStatus = useObservableState(product.tax_status$, product.tax_status);
	// const taxClass = useObservableState(product.tax_class$, product.tax_class);
	const { display } = column;
	const pushDocument = usePushDocument();

	const handleUpdate = React.useCallback(
		async (regular_price) => {
			const p = await product.patch({ regular_price });
			pushDocument(p);
		},
		[product, pushDocument]
	);

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
	return <NumberInput value={product.regular_price || '0'} onChange={handleUpdate} showDecimals />;
};

export default RegularPrice;
