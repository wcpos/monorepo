import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Button from '@wcpos/common/src/components/button';

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

	return (
		<Button
			title={price}
			onPress={() => {
				console.log('numpad');
			}}
			background="outline"
		/>
	);
};

export default FeeAndShippingPrice;
