import * as React from 'react';
import { Platform, View, type ViewProps } from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { usePointer } from '@wcpos/components/lib/device';

/**
 * The way back a level owes beyond its crumb: Escape (web) and the edge swipe (touch). Escape
 * stops at the deepest wrapper, so a level inside a level — or a drill inside a level — goes
 * back one step per press.
 */
export function LevelBack({
	onBack,
	testID,
	children,
}: {
	onBack: () => void;
	testID?: string;
	children: React.ReactNode;
}) {
	const pointer = usePointer();
	const pan = Gesture.Pan()
		.runOnJS(true)
		.enabled(pointer === 'coarse')
		.hitSlop({ left: 0, width: 24 })
		.activeOffsetX(24)
		.failOffsetY([-24, 24])
		.onEnd((event) => {
			if (event.translationX > 24) onBack();
		});
	return (
		<GestureDetector gesture={pan}>
			<View
				className="flex-1"
				testID={testID}
				{...(Platform.OS === 'web'
					? {
							onKeyDown: (event: Parameters<NonNullable<ViewProps['onKeyDown']>>[0]) => {
								if (event.nativeEvent.key === 'Escape') {
									event.stopPropagation();
									onBack();
								}
							},
						}
					: {})}
			>
				{children}
			</View>
		</GestureDetector>
	);
}
