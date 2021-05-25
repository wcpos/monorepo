import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import TextInput from '@wcpos/common/src/components/textinput';

interface Props {
	item:
		| import('@wcpos/common/src/database').FeeLineDocument
		| import('@wcpos/common/src/database').ShippingLineDocument;
}

const FeeAndShippingPrice = ({ item }: Props) => {
	const price = useObservableState(item.total$, item.total);

	const handleChange = async (newValue: string): Promise<void> => {
		item.atomicPatch({ total: newValue });
	};

	return <TextInput label="Price" hideLabel autosize value={price} onChange={handleChange} />;
};

export default FeeAndShippingPrice;
