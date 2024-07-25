import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import TextInput from '@wcpos/components/src/textinput';

type ProductDocument = import('@wcpos/database').ProductDocument;

type Props = {
	item: ProductDocument;
	column: import('@wcpos/tailwind/src/table').ColumnProps<ProductDocument>;
	onChange: (product: ProductDocument, data: Record<string, unknown>) => void;
};

const Barcode = ({ item: product, column, onChange }: Props) => {
	const barcode = useObservableState(product.barcode$, product.barcode);
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
	return (
		<View style={{ width: '100%' }}>
			<TextInput value={value} onChangeText={handleChangeText} onBlur={handleOnBlur} />
		</View>
	);
};

export default Barcode;
