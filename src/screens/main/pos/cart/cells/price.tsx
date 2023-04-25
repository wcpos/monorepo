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

/**
 * The price is not actually the price, because the WC REST API is a piece of shit
 * - price as returned by REST API is total / quantity which is counter intuitive
 * - to give users a price field we need to do some gymnastics - subtotal / quantity
 */
export const Price = ({ item }: Props) => {
	const subtotal = useObservableState(item.subtotal$, item.subtotal);
	const quantity = item.getLatest().quantity;
	const price = parseFloat(subtotal) / quantity;
	const { format } = useCurrencyFormat({ withSymbol: false });
	const priceRef = React.useRef(String(price));

	/**
	 * update subtotal, not price
	 */
	const handleUpdate = React.useCallback(() => {
		const quantity = item.getLatest().quantity;
		item.incrementalPatch({ subtotal: String(quantity * parseFloat(priceRef.current)) });
	}, [item]);

	/**
	 *
	 */
	return (
		<Popover
			withinPortal
			primaryAction={{
				label: 'Done',
				action: handleUpdate,
			}}
		>
			<Popover.Target>
				<Box border paddingY="xSmall" paddingX="small" rounding="large">
					<Text>{format(price)}</Text>
				</Box>
			</Popover.Target>
			<Popover.Content>
				<Numpad
					initialValue={String(price)}
					onChange={(newValue: string) => {
						priceRef.current = newValue;
					}}
				/>
			</Popover.Content>
		</Popover>
	);
};
