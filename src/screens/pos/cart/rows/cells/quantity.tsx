import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Button from '@wcpos/components/src/button';
import Popover from '@wcpos/components/src/popover';
import Numpad from '@wcpos/components/src/numpad';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

const Quantity = ({ item }: Props) => {
	const quantity = useObservableState(item.quantity$, item.quantity);

	const handleQuantityChange = async (newValue: string): Promise<void> => {
		item.atomicPatch({ quantity: Number(newValue) });
	};

	return (
		<Popover content={<Numpad initialValue={String(quantity)} onChange={handleQuantityChange} />}>
			<Button title={String(quantity)} background="outline" />
		</Popover>
	);
};

export default Quantity;
