import * as React from 'react';
import TextInput from '../../../../../components/textinput';

type Props = {
	lineItem: any;
	price: string;
};

const Price = ({ lineItem, price }: Props): React.ReactElement => {
	const handleChangeText = async (newValue: string): Promise<void> => {
		lineItem.update({
			$set: {
				price: Number(newValue),
			},
		});
	};

	return <TextInput value={String(price)} onChangeText={handleChangeText} />;
};

export default Price;
