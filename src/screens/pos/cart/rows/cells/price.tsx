import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import TextInput from '@wcpos/common/src/components/textinput';

interface Props {
	lineItem: import('@wcpos/common/src/database').LineItemDocument;
}

const Price = ({ lineItem }: Props) => {
	const price = useObservableState(lineItem.price$, lineItem.price);

	const handleChange = async (newValue: string): Promise<void> => {
		lineItem.atomicPatch({ price: Number(newValue) });
	};

	return <TextInput autosize value={String(price)} onChange={handleChange} />;
};

export default Price;
