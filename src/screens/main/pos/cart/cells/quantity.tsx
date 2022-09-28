import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import Popover from '@wcpos/components/src/popover';
import Numpad from '@wcpos/components/src/numpad';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

export const Quantity = ({ item }: Props) => {
	const quantity = useObservableState(item.quantity$, item.quantity);

	const handleQuantityChange = async (newValue: string): Promise<void> => {
		item.atomicPatch({ quantity: Number(newValue) });
	};

	return (
		<Popover content={<Numpad initialValue={String(quantity)} onChange={handleQuantityChange} />}>
			<Box border paddingY="xSmall" paddingX="small" rounding="large">
				<Text>{String(quantity)}</Text>
			</Box>
		</Popover>
	);
};
