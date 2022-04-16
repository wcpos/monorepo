import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Button from '@wcpos/components/src/button';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

const Price = ({ item }: Props) => {
	const price = useObservableState(item.price$, item.price);

	const handleChange = async (newValue: string): Promise<void> => {
		item.atomicPatch({ price: Number(newValue) });
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
