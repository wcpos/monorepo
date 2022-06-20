import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Popover from '@wcpos/components/src/popover';
import Numpad from '@wcpos/components/src/numpad';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

interface Props {
	item: import('@wcpos/database').FeeLineDocument | import('@wcpos/database').ShippingLineDocument;
}

const FeeAndShippingPrice = ({ item }: Props) => {
	const price = useObservableState(item.total$, item.total);

	const handleChange = async (newValue: string): Promise<void> => {
		item.atomicPatch({ total: newValue });
	};

	return (
		<Popover content={<Numpad initialValue={String(price)} onChange={handleChange} />}>
			<Box border paddingY="xSmall" paddingX="small" rounding="large">
				<Text>{String(price)}</Text>
			</Box>
		</Popover>
	);
};

export default FeeAndShippingPrice;
