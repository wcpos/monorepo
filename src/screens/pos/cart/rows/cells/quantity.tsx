import * as React from 'react';
import TextInput from '@wcpos/common/src/components/textinput';

interface Props {
	lineItem: import('@wcpos/common/src/database/line-items').LineItemDocument;
}

const Quantity = ({ lineItem }: Props) => {
	const handleChangeText = async (newValue: string): Promise<void> => {
		lineItem.atomicPatch({ quantity: Number(newValue) });
	};

	return <TextInput value={String(lineItem.quantity)} onChangeText={handleChangeText} />;
};

export default Quantity;
