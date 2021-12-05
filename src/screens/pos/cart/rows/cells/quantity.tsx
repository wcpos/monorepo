import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Button from '@wcpos/common/src/components/button';
import Popover from '@wcpos/common/src/components/popover';
import Numpad from '@wcpos/common/src/components/numpad';

interface Props {
	lineItem: import('@wcpos/common/src/database').LineItemDocument;
}

const Quantity = ({ lineItem }: Props) => {
	const quantity = useObservableState(lineItem.quantity$, lineItem.quantity);

	const handleChangeText = async (newValue: string): Promise<void> => {
		lineItem.atomicPatch({ quantity: Number(newValue) });
	};

	return (
		<Popover content={<Numpad placeholder={String(quantity)} />}>
			<Button title={String(quantity)} background="outline" />
		</Popover>
	);
};

export default Quantity;
