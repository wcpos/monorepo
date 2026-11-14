import * as React from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '../lib/utils';
import { Text } from '../text';

/**
 * Error-code chip (`SYNC132`). Pressable only when the code exists in the
 * error catalogue — never a dead link.
 */
export function CodeChip({
	code,
	onPress,
	testID,
}: {
	code: string;
	onPress?: () => void;
	testID?: string;
}) {
	const text = <Text className="text-bad font-mono text-xs font-semibold">{code}</Text>;
	const chipClass = 'bg-bad/15 self-end rounded-md px-2 py-0.5';

	if (!onPress) {
		return (
			<View testID={testID} className={chipClass}>
				{text}
			</View>
		);
	}

	return (
		<Pressable
			testID={testID}
			accessibilityRole="button"
			accessibilityLabel={code}
			onPress={onPress}
			className={cn(chipClass, 'web:hover:bg-bad/20')}
		>
			{text}
		</Pressable>
	);
}
