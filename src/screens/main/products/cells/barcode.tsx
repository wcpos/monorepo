import * as React from 'react';

import { CellContext } from '@tanstack/react-table';
import { useObservableEagerState } from 'observable-hooks';

import { Input } from '@wcpos/components/src/input';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const Barcode = ({ row }: CellContext<ProductDocument, 'name'>) => {
	const product = row.original;
	const barcode = useObservableEagerState(product.barcode$);
	const [value, setValue] = React.useState(barcode);

	/**
	 *
	 */
	const handleChangeText = React.useCallback((val: string) => {
		setValue(val);
	}, []);

	/**
	 *
	 */
	// const handleOnBlur = React.useCallback(() => {
	// 	onChange(product, { barcode: value });
	// }, [onChange, product, value]);

	/**
	 *
	 */
	React.useEffect(() => {
		setValue(barcode);
	}, [barcode]);

	/**
	 *
	 */
	return (
		<Input
			value={value}
			onChangeText={handleChangeText}
			//onBlur={handleOnBlur}
		/>
	);
};
