import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Numpad from '@wcpos/components/src/numpad';
import Popover from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';

import useCurrencyFormat from '../../../hooks/use-currency-format';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

export const Price = ({ item }: Props) => {
	const price = useObservableState(item.price$, item.price);
	const { format } = useCurrencyFormat({ withSymbol: false });

	return (
		<Popover withinPortal>
			<Popover.Target>
				<Box border paddingY="xSmall" paddingX="small" rounding="large">
					<Text>{format(price)}</Text>
				</Box>
			</Popover.Target>
			<Popover.Content>
				<Numpad
					initialValue={String(price)}
					onChange={(newValue: string) => {
						item.patch({ price: Number(newValue) });
					}}
				/>
			</Popover.Content>
		</Popover>
	);
};
