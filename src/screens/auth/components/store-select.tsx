import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';

interface StoreSelectProps {
	stores: import('@wcpos/database').StoreDocument[];
	onSelect: (storeID: string) => void;
}

const StoreSelect = ({ stores, onSelect }: StoreSelectProps) => {
	return (
		<Box space="small">
			{stores.map((store) => (
				<Button key={store.localID} onPress={() => onSelect(store.localID)}>
					{store.name}
				</Button>
			))}
		</Box>
	);
};

export default StoreSelect;
