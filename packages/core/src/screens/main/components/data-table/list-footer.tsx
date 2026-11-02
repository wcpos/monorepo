import * as React from 'react';
import { View } from 'react-native';

import { Loader } from '@wcpos/components/loader';

/** Under the last row while the engine pulls the collection: the live handle's `active`. */
export function ListFooterComponent({ active }: { active: boolean }) {
	if (!active) return null;

	return (
		<View className="bg-card items-center justify-center p-2">
			<Loader />
		</View>
	);
}
