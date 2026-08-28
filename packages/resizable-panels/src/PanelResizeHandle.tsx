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
	style?: StyleProp<ViewStyle>;
	disabled?: boolean;
	onDragging?: PanelResizeHandleOnDragging;
	order?: number;
}

export function PanelResizeHandle({
	style,
	disabled = false,
	onDragging,
	order,
	...viewProps
}: PanelResizeHandleProps) {
	const context = React.useContext(PanelGroupContext);
	if (context === null) {
		throw new Error('<PanelResizeHandle> must be rendered inside a <PanelGroup>');
	}
	const {
		direction,
		disabled: groupDisabled,
		model,
		beginDrag,
		drag,
		endDrag,
		registerElement,
		unregisterElement,
	} = context;
	const handleId = React.useId();
	const isDisabled = disabled || groupDisabled;
	const setElementRef = React.useCallback(
		(element: object | null) => {
			if (element) registerElement(handleId, element);
			else unregisterElement(handleId);
		},
		[handleId, registerElement, unregisterElement]
	);

	React.useLayoutEffect(() => {
		model.registerHandle(handleId, order);
		return () => model.unregisterHandle(handleId);
	}, [model, handleId, order]);

	const panGesture = Gesture.Pan()
		.onBegin(() => {
			'worklet';
			if (isDisabled) return;
			if (onDragging) scheduleOnRN(onDragging, true);
			scheduleOnRN(beginDrag, handleId);
		})
		.onUpdate((event: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
			'worklet';
			if (isDisabled) return;
			scheduleOnRN(drag, event.translationX, event.translationY);
		})
		.onFinalize(() => {
			'worklet';
			if (isDisabled) return;
			if (onDragging) scheduleOnRN(onDragging, false);
			scheduleOnRN(endDrag);
		});
	const defaultHandleStyle: ViewStyle =
		direction === 'horizontal'
			? { width: 0, alignSelf: 'stretch' }
			: { height: 0, alignSelf: 'stretch' };

	return (
		<GestureDetector gesture={panGesture}>
			<View ref={setElementRef} style={[defaultHandleStyle, style]} {...viewProps} />
		</GestureDetector>
	);
}
