import React from 'react';
import { useWindowDimensions, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Discord from './discord';

// Helper to account for padding (p-2 = 8px on each side)
const adjustForPadding = (width: number, height: number) => {
	const paddingHorizontal = 16; // 8px on each side
	const paddingVertical = 16; // 8px on each side
	return {
		width: Math.max(0, width - paddingHorizontal),
		height: Math.max(0, height - paddingVertical),
	};
};

export function Support() {
	// The window seeds the size so the DOM component never mounts at 0×0; once
	// the container reports its own layout that wins, and it reports again on
	// every rotation, so no separate dimension listener is needed.
	const window = useWindowDimensions();
	const [layout, setLayout] = React.useState<{ width: number; height: number } | null>(null);
	const dimensions = layout ?? adjustForPadding(window.width, window.height);
	const { bottom } = useSafeAreaInsets();

	const handleLayout = (event: LayoutChangeEvent) => {
		const { width, height } = event.nativeEvent.layout;
		setLayout(adjustForPadding(width, height));
	};

	return (
		<View
			testID="screen-support"
			className="h-full w-full p-2"
			onLayout={handleLayout}
			style={{ paddingBottom: bottom !== 0 ? bottom : undefined }}
		>
			<Discord
				dom={{
					matchContents: true,
					scrollEnabled: false,
					containerStyle: {
						width: dimensions.width,
						height: dimensions.height,
					},
				}}
				width={dimensions.width}
				height={dimensions.height}
			/>
		</View>
	);
}
