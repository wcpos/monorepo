import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import NumberInput from '../../../components/number-input';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

type Props = {
	item: ProductDocument | ProductVariationDocument;
	column: import('@wcpos/components/src/table').ColumnProps<ProductDocument>;
	onChange: (product: ProductDocument, data: Record<string, unknown>) => void;
};

const EdittablePrice = ({ item, column, onChange }: Props) => {
	const price = useObservableState(item[`${column.key}$`], item[column.key]);
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
			value={price || '0'}
			onChange={(price) => onChange(item, { [column.key]: price })}
			disabled={column.key === 'sale_price' && !item.on_sale}
			showDecimals
		/>
	);
};

export default EdittablePrice;
