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
 * Changing the total actually updates the price, because the WC REST API makes no sense
 */
export const Total = ({ item }: Props) => {
	const total = useObservableState(item.total$, item.total);
	const { format } = useCurrencyFormat({ withSymbol: false });
	const totalRef = React.useRef(String(total));

	/**
	 *
	 */
	const handleUpdate = React.useCallback(() => {
		const quantity = item.getLatest().quantity;
		item.incrementalPatch({
			total: totalRef.current,
			price: parseFloat(totalRef.current) / quantity,
		});
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
					<Text>{format(total)}</Text>
				</Box>
			</Popover.Target>
			<Popover.Content>
				<Numpad
					initialValue={String(total)}
					onChange={(newValue: string) => {
						totalRef.current = newValue;
					}}
				/>
			</Popover.Content>
		</Popover>
	);
};
