import * as React from 'react';
import { View } from 'react-native';

/**
 *
 */
export function Row({ children }: { children: React.ReactNode }) {
	return (
		<View className="flex-row justify-between">
			{React.Children.map(children, (child) => (
				<View className="flex-1">{child}</View>
			))}
		</View>
	);
}
