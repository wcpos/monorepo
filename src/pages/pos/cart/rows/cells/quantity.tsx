import * as React from 'react';
import TextInput from '../../../../../components/textinput';

type Props = {
	lineItem: any;
	quantity: number;
};

const Quantity = ({ lineItem, quantity }: Props): React.ReactElement => {
	const handleChangeText = async (newValue: string): Promise<void> => {
		lineItem.update({
			$set: {
				quantity: Number(newValue),
			},
		});
	};

	return <TextInput value={String(quantity)} onChangeText={handleChangeText} />;
};

export default Quantity;
