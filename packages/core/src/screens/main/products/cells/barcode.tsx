import * as React from 'react';

import { CellContext } from '@tanstack/react-table';
import { useObservableEagerState } from 'observable-hooks';

import { Input } from '@wcpos/components/src/input';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const Barcode = ({ row, table }: CellContext<{ document: ProductDocument }, 'name'>) => {
	const product = row.original.document;
	const barcode = useObservableEagerState(product.barcode$);
	const [value, setValue] = React.useState(barcode);

	/**
	 * Update value if prop changes
	 */
	React.useEffect(() => {
		setValue(barcode);
	}, [barcode]);

	/**
	 *
	 */
	const handleSubmit = React.useCallback(() => {
		table.options.meta.onChange({ document: product, changes: { barcode: value } });
	}, [product, table.options.meta, value]);

	/**
	 *
	 */
	return (
		<Input
			value={value}
			onChangeText={setValue}
			onBlur={handleSubmit}
			onSubmitEditing={handleSubmit}
			blurOnSubmit
		/>
	);
};
