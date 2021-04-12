import * as React from 'react';
import TextInput from '@wcpos/common/src/components/textinput';

interface Props {
	lineItem:
		| import('@wcpos/common/src/database').LineItemDocument
		| import('@wcpos/common/src/database').FeeLineDocument
		| import('@wcpos/common/src/database').ShippingLineDocument;
}

const Price = ({ lineItem }: Props) => {
	const handleChangeText = async (newValue: string): Promise<void> => {
		lineItem.atomicPatch({ price: Number(newValue) });
	};

	return <TextInput value={String(lineItem.price)} onChangeText={handleChangeText} />;
};

export default Price;
