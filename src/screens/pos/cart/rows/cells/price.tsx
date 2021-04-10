import * as React from 'react';
import TextInput from '@wcpos/common/src/components/textinput';

interface Props {
	lineItem:
		| import('@wcpos/common/src/database/line-items').LineItemDocument
		| import('@wcpos/common/src/database/fee-lines').FeeLineDocument
		| import('@wcpos/common/src/database/shipping-lines').ShippingLineDocument;
}

const Price = ({ lineItem }: Props) => {
	const handleChangeText = async (newValue: string): Promise<void> => {
		lineItem.atomicPatch({ price: Number(newValue) });
	};

	return <TextInput value={String(lineItem.price)} onChangeText={handleChangeText} />;
};

export default Price;
