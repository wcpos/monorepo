import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Numpad from '@wcpos/components/src/numpad';
import Popover from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

const StockQuantity = ({ item: product }: Props) => {
	// const stockQuantity = useObservableState(product.stock_quantity$, product.stock_quantity);
	// const manageStock = useObservableState(product.manage_stock$, product.manage_stock);
	const stockQuantity = product.stock_quantity || 0;
	const manageStock = product.manage_stock;
	const numpadRef = React.useRef(String(stockQuantity));

	const handleUpdate = React.useCallback(() => {
		product.patch({ stock_quantity: Number(numpadRef.current) });
	}, [product]);

	if (!manageStock) {
		return null;
	}

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
					<Text>{stockQuantity}</Text>
				</Box>
			</Popover.Target>
			<Popover.Content>
				<Numpad
					initialValue={String(stockQuantity)}
					onChange={(newValue: string) => {
						numpadRef.current = newValue;
					}}
				/>
			</Popover.Content>
		</Popover>
	);
	// return <Text>{stockQuantity}</Text>;
};

export default StockQuantity;
