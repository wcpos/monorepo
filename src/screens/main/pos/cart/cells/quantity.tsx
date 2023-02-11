import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Numpad from '@wcpos/components/src/numpad';
import Popover from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

export const Quantity = ({ item }: Props) => {
	const quantity = useObservableState(item.quantity$, item.quantity);

	return (
		<Popover withinPortal>
			<Popover.Target>
				<Box border paddingY="xSmall" paddingX="small" rounding="large">
					<Text>{String(quantity)}</Text>
				</Box>
			</Popover.Target>
			<Popover.Content>
				<Numpad
					initialValue={String(quantity)}
					onChange={(newValue: string) => {
						item.patch({ quantity: Number(newValue) });
					}}
				/>
			</Popover.Content>
		</Popover>
	);
};
