import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';

interface MismatchBadgeProps {
	message: string | null;
}

/**
 * Amber warning badge shown when the selected template and printer
 * have incompatible output types.
 */
export function MismatchBadge({ message }: MismatchBadgeProps) {
	if (!message) return null;

	return (
		<View className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5">
			<Text className="text-xs text-amber-800">{message}</Text>
		</View>
	);
}
