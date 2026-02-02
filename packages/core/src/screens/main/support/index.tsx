import React from 'react';
import { Dimensions, View } from 'react-native';
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

export const Support = () => {
	const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 });
	const { bottom } = useSafeAreaInsets();

	const handleLayout = (event: LayoutChangeEvent) => {
		const { width, height } = event.nativeEvent.layout;
		setDimensions(adjustForPadding(width, height));
	};

	// Listen for dimension changes (like rotation)
	React.useEffect(() => {
		const updateDimensions = () => {
			const { width, height } = Dimensions.get('window');
			// View is full width/height with padding, so adjust
			setDimensions(adjustForPadding(width, height));
		};

		// Update on mount
		updateDimensions();

		// Add event listener for dimension changes
		const dimensionListener = Dimensions.addEventListener('change', updateDimensions);

		// Cleanup
		return () => {
			dimensionListener.remove();
		};
	}, []);

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
};
