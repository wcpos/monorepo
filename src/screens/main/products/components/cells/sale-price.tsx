import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import NumberInput from '../../../components/number-input';
import usePushDocument from '../../../contexts/use-push-document';

type Props = {
	item: import('@wcpos/database').ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
};

const SalePrice = ({ item: product, column }: Props) => {
	const { display } = column;
	const pushDocument = usePushDocument();

	const handleUpdate = React.useCallback(
		async (sale_price) => {
			const p = await product.patch({ sale_price });
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
	return (
		<NumberInput
			value={product.sale_price || '0'}
			onChange={handleUpdate}
			disabled={!product.on_sale}
			showDecimals
		/>
	);
};

export default SalePrice;
