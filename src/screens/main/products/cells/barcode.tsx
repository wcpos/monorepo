import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Input } from '@wcpos/tailwind/src/input';

type ProductDocument = import('@wcpos/database').ProductDocument;

type Props = {
	item: ProductDocument;
	column: import('@wcpos/tailwind/src/table').ColumnProps<ProductDocument>;
	onChange: (product: ProductDocument, data: Record<string, unknown>) => void;
};

const Barcode = ({ item: product, column, onChange }: Props) => {
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
	const handleOnBlur = React.useCallback(() => {
		onChange(product, { barcode: value });
	}, [onChange, product, value]);

	/**
	 *
	 */
	React.useEffect(() => {
		setValue(barcode);
	}, [barcode]);

	/**
	 *
	 */
	return <Input value={value} onChangeText={handleChangeText} onBlur={handleOnBlur} />;
};

export default Barcode;
