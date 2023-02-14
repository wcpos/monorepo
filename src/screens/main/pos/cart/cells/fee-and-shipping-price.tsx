import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Numpad from '@wcpos/components/src/numpad';
import Popover from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';

import useCurrencyFormat from '../../../hooks/use-currency-format';

interface Props {
	item: import('@wcpos/database').FeeLineDocument | import('@wcpos/database').ShippingLineDocument;
}

export const FeeAndShippingPrice = ({ item }: Props) => {
	const price = useObservableState(item.total$, item.total);
	const { format } = useCurrencyFormat({ withSymbol: false });
	const priceRef = React.useRef(String(price));

	/**
	 *
	 */
	const handleUpdate = React.useCallback(() => {
		item.incrementalPatch({ total: priceRef.current });
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
