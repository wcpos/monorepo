import * as React from 'react';
import { View } from 'react-native';

import debounce from 'lodash/debounce';
import { useObservableState } from 'observable-hooks';

import TextInput from '@wcpos/components/src/textinput';

type ProductDocument = import('@wcpos/database').ProductDocument;

type Props = {
	item: ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<ProductDocument>;
	onChange: (product: ProductDocument, data: Record<string, unknown>) => void;
};

const Barcode = ({ item: product, column, onChange }: Props) => {
	const [value, setValue] = React.useState(product.barcode);

	/**
	 * FIXME: this is a hack similar to what we did in the Form component
	 * we need to keep the textinput responsive while the user is typing
	 * but we don't want to save the value until they are done typing
	 * and then data is going to come back from the server which could cause a problem
	 */
	const debouncedOnChange = React.useCallback(
		debounce((val: string) => {
			onChange(product, { barcode: val });
		}, 500), // Adjust the debounce time (in ms) as needed
		[onChange]
	);
	const handleOnChange = React.useCallback(
		(val: any) => {
			setValue(val);
			debouncedOnChange(val);
		},
		[debouncedOnChange]
	);
	React.useEffect(() => {
		setValue(product.barcode);
	}, [product.barcode]);

	/**
	 *
	 */
	return (
		<View style={{ width: '100%' }}>
			<TextInput value={value} onChangeText={handleOnChange} />
		</View>
	);
};

export default Barcode;
