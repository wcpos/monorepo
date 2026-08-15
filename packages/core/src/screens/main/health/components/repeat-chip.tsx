import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';

/**
 * Repeat-collapse chip: one row standing for N identical consecutive events
 * (`×47`). Optional suffix carries the plain-language qualifier.
 */
export function RepeatChip({
	count,
	suffix,
	testID,
}: {
	count: number;
	suffix?: string;
	testID?: string;
}) {
	return (
		<View testID={testID} className="bg-muted self-start rounded-full px-2 py-px">
			<Text className="text-muted-foreground font-mono text-[11px]">
				{`×${count.toLocaleString()}${suffix ? ` ${suffix}` : ''}`}
			</Text>
		</View>
	);
}
