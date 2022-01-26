import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Button from '@wcpos/common/src/components/button';
import Popover from '@wcpos/common/src/components/popover';
import Numpad from '@wcpos/common/src/components/numpad';

interface Props {
	item: import('@wcpos/common/src/database').LineItemDocument;
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
