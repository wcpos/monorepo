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
	const quantityRef = React.useRef(String(quantity));

	/**
	 *
	 */
	const handleUpdate = React.useCallback(() => {
		const current = item.getLatest();
		const currentQuantity = current.quantity;
		const currentSubtotal = current.subtotal;
		const currentTotal = current.total;
		item.incrementalPatch({
			quantity: Number(quantityRef.current),
			subtotal: String(
				(parseFloat(currentSubtotal) / currentQuantity) * Number(quantityRef.current)
			),
			total: String((parseFloat(currentTotal) / currentQuantity) * Number(quantityRef.current)),
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
					<Text>{String(quantity)}</Text>
				</Box>
			</Popover.Target>
			<Popover.Content>
				<Numpad
					initialValue={String(quantity)}
					onChange={(newValue: string) => {
						quantityRef.current = newValue;
					}}
				/>
			</Popover.Content>
		</Popover>
	);
};
