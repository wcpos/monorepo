import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import TextInput from '@wcpos/common/src/components/textinput';
import Text from '@wcpos/common/src/components/text';

interface Props {
	lineItem: import('@wcpos/common/src/database').LineItemDocument;
}

const Quantity = ({ lineItem }: Props) => {
	// @ts-ignore
	const quantity = useObservableState(lineItem.quantity$, lineItem.quantity);
	console.log(quantity);

	const handleChangeText = async (newValue: string): Promise<void> => {
		lineItem.atomicPatch({ quantity: Number(newValue) });
	};

	return (
		<>
			<TextInput value={String(quantity)} onChange={handleChangeText} />
			<Text>{quantity}</Text>
		</>
	);
};

export default Quantity;
