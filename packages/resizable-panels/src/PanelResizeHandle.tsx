import React from 'react';
import { StyleProp, View, ViewProps, ViewStyle } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import {
	Gesture,
	GestureDetector,
	GestureUpdateEvent,
	PanGestureHandlerEventPayload,
} from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { PanelGroupContext } from './PanelGroupContext';
import { useSeparatorA11y } from './hooks/useSeparatorA11y';
import { getResizeTargetMinimumSize } from './utils/pointerPrecision';

export type PanelResizeHandleOnDragging = (isDragging: boolean) => void;
export interface PanelResizeHandleProps extends ViewProps {
	style?: StyleProp<ViewStyle>;
	disabled?: boolean;
	disableDoubleTap?: boolean;
	hitTargetSize?: number;
	onDragging?: PanelResizeHandleOnDragging;
	order?: number;
}

export function PanelResizeHandle({
	style,
	disabled = false,
	disableDoubleTap = false,
	hitTargetSize,
	onDragging,
	onLayout,
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
	const [measuredSize, setMeasuredSize] = React.useState<number>();
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
	const a11yProps = useSeparatorA11y({ direction, disabled: isDisabled, handleId, model });
	const handleLayout = React.useCallback(
		(event: LayoutChangeEvent) => {
			const { width, height } = event.nativeEvent.layout;
			setMeasuredSize(direction === 'horizontal' ? width : height);
			onLayout?.(event);
		},
		[direction, onLayout]
	);

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
	const targetSize = hitTargetSize ?? getResizeTargetMinimumSize();
	const hitSlop = measuredSize == null ? 0 : Math.max(0, (targetSize - measuredSize) / 2);
	if (hitSlop > 0) {
		panGesture.hitSlop(
			direction === 'horizontal'
				? { left: hitSlop, right: hitSlop }
				: { top: hitSlop, bottom: hitSlop }
		);
	}
	// Capture the bare function: referencing `model.*` inside the worklet would serialise the whole model.
	const resetPanelToDefault = model.resetPanelToDefault;
	// Race lets a moving pointer activate the pan immediately instead of waiting for a tap to fail.
	const gesture = disableDoubleTap
		? panGesture
		: Gesture.Race(
				panGesture,
				Gesture.Tap()
					.numberOfTaps(2)
					.onEnd(() => {
						'worklet';
						if (isDisabled) return;
						scheduleOnRN(resetPanelToDefault, handleId);
					})
			);
	const defaultHandleStyle: ViewStyle =
		direction === 'horizontal'
			? { width: 0, alignSelf: 'stretch' }
			: { height: 0, alignSelf: 'stretch' };

	return (
		<GestureDetector gesture={gesture}>
			<View
				ref={setElementRef}
				style={[defaultHandleStyle, style]}
				{...viewProps}
				{...a11yProps}
				onLayout={handleLayout}
			/>
		</GestureDetector>
	);
}
