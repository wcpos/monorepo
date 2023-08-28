import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';

type StoreDocument = import('@wcpos/database').StoreDocument;

interface StoreSelectProps {
	storesResource: ObservableResource<StoreDocument[]>;
	onSelect: (store: StoreDocument) => void;
	currentStoreID: string;
}

const StoreSelect = ({ storesResource, onSelect, currentStoreID }: StoreSelectProps) => {
	const stores = useObservableSuspense(storesResource);

	return (
		<Box space="small">
			{stores.map((store) => (
				<Button
					key={store.localID}
					onPress={() => onSelect(store)}
					disabled={store.localID === currentStoreID}
				>
					{store.name}
				</Button>
			))}
		</Box>
	);
};

export default StoreSelect;
