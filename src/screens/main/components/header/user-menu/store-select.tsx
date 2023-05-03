import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';

interface StoreSelectProps {
	storesResource: ObservableResource<import('@wcpos/database').StoreDocument[]>;
	onSelect: (storeID: string) => void;
	currentStoreID: string;
}

const StoreSelect = ({ storesResource, onSelect, currentStoreID }: StoreSelectProps) => {
	const stores = useObservableSuspense(storesResource);

	return (
		<Box space="small">
			{stores.map((store) => (
				<Button
					key={store.localID}
					onPress={() => onSelect(store.localID)}
					disabled={store.localID === currentStoreID}
				>
					{store.name}
				</Button>
			))}
		</Box>
	);
};

export default StoreSelect;
