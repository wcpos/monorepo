import React from 'react';
import { StyleProp, View, ViewProps, ViewStyle } from 'react-native';

import {
	Gesture,
	GestureDetector,
	GestureUpdateEvent,
	PanGestureHandlerEventPayload,
} from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { PanelGroupContext } from './PanelGroupContext';

export type PanelResizeHandleOnDragging = (isDragging: boolean) => void;

export interface PanelResizeHandleProps extends ViewProps {
	/**
	 * An optional style to apply to the handle View.
	 * By default, we give it a thin touchable bar that spans the full cross‐axis.
	 */
	style?: StyleProp<ViewStyle>;

	/** If true, the handle is disabled (no gestures). */
	disabled?: boolean;

	/**
	 * A callback that is called when the handle is dragged.
	 */
	onDragging?: PanelResizeHandleOnDragging;
}

/**
 * A draggable handle between two panels. Uses React Native Gesture Handler
 * with GestureDetector + Gesture.Pan().
 */
export function PanelResizeHandle({
	style,
	disabled = false,
	onDragging,
	...viewProps
}: PanelResizeHandleProps) {
	const context = React.useContext(PanelGroupContext);
	if (context === null) {
		throw new Error('<PanelResizeHandle> must be rendered inside a <PanelGroup>');
	}

	const { direction, startDragging, updateLayout, stopDragging, registerHandle } = context;

	// Give each handle a stable unique ID, so the parent can track them separately.
	const handleId = React.useId();

	// Registration must run after the group provider is mounted.
	React.useEffect(() => {
		registerHandle(handleId);
		// no cleanup needed—if the handle unmounts, the group will eventually drop its map entry
		// (or you could add an unregisterHandle if you want).
	}, [registerHandle]);

	// Create a Pan gesture. onBegin triggers startDragging,
	// onUpdate runs the resize handler, onEnd calls stopDragging.
	const panGesture = Gesture.Pan()
		.onBegin(() => {
			'worklet';
			if (disabled) return;
			if (onDragging) {
				scheduleOnRN(onDragging, true);
			}
			scheduleOnRN(startDragging, handleId);
		})
		.onUpdate((e: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
			'worklet';
			if (disabled) return;
			scheduleOnRN(updateLayout, handleId, e);
		})
		.onEnd(() => {
			'worklet';
			if (disabled) return;
			if (onDragging) {
				scheduleOnRN(onDragging, false);
			}
			scheduleOnRN(stopDragging);
		});

	/**
	 * The visual/clickable area:
	 * • If direction is 'horizontal', we make a zero-width vertical bar.
	 * • If direction is 'vertical', we make a zero-height horizontal bar.
	 * Consumers should provide a touch target via style={…}.
	 */
	const defaultHandleStyle: ViewStyle =
		direction === 'horizontal'
			? { width: 0, alignSelf: 'stretch' }
			: { height: 0, alignSelf: 'stretch' };

	return (
		<GestureDetector gesture={panGesture}>
			<View style={[defaultHandleStyle, style]} {...viewProps} />
		</GestureDetector>
	);
}
