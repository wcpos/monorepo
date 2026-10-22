import * as React from 'react';
import { View } from 'react-native';

import { Skeleton } from '@wcpos/components/skeleton';

/** Enough pills to read as the row; the real count varies by page and by what is set. */
const PLACEHOLDER_CHIPS = 4;

/**
 * The chip row's frame while its pills are still answering: the same `p-4` row at the chips'
 * own height, so the table card under it stands where it will once the pills arrive. The row
 * used to mount with the table, after its skeleton, and push the card down when it came
 * (owner, 2026-10-22: "jarring, either load the filter bar or at least skeleton").
 */
export function FilterBarSkeleton({ testID = 'filter-bar-skeleton' }: { testID?: string }) {
	return (
		<View testID={testID} className="flex-row items-center gap-2 p-4">
			{Array.from({ length: PLACEHOLDER_CHIPS }, (_, index) => (
				<Skeleton key={index} shape="chip" />
			))}
		</View>
	);
}
