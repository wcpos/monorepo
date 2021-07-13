import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Button from '@wcpos/common/src/components/button';

interface Props {
	lineItem: import('@wcpos/common/src/database').LineItemDocument;
}

const Price = ({ lineItem }: Props) => {
	const price = useObservableState(lineItem.price$, lineItem.price);

	const handleChange = async (newValue: string): Promise<void> => {
		lineItem.atomicPatch({ price: Number(newValue) });
	};

	return (
		<Button
			title={String(price)}
			onPress={() => {
				console.log('numpad');
			}}
			background="outline"
		/>
	);
};

export default Price;
