import * as React from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { usePhoneSheetMetrics } from './native-popover-sizing';
import { PANEL_SLIDE_MS, PANEL_SLIDE_OUT_MS } from './overlay-motion';
import { cn } from './utils';

export function PhoneSheetShell({
	children,
	onDismiss,
	className,
	style,
	testID,
}: Pick<ViewProps, 'children' | 'className' | 'style' | 'testID'> & {
	onDismiss: () => void;
}) {
	const sheet = usePhoneSheetMetrics();
	return (
		<>
			{Platform.OS === 'web' && (
				<Pressable className="absolute inset-0 bg-black/50" onPress={onDismiss} />
			)}
			<Animated.View
				entering={SlideInDown.duration(PANEL_SLIDE_MS)}
				exiting={SlideOutDown.duration(PANEL_SLIDE_OUT_MS)}
				className="justify-end"
				pointerEvents="box-none"
				style={StyleSheet.absoluteFill}
			>
				<View
					testID={testID}
					className={cn('bg-popover border-border w-full border-t p-2 shadow-md', className)}
					style={[
						{ maxHeight: sheet.maxHeight, paddingBottom: Math.max(sheet.bottomInset, 8) },
						style,
					]}
				>
					{children}
				</View>
			</Animated.View>
		</>
	);
}
