import React, { forwardRef, PropsWithChildren, useImperativeHandle, useMemo, useRef } from 'react';
import { LayoutRectangle, StyleProp, View, ViewStyle } from 'react-native';

import * as Haptics from 'expo-haptics';
import {
	Gesture,
	GestureDetector,
	GestureEventPayload,
	GestureStateChangeEvent,
	GestureUpdateEvent,
	PanGestureHandlerEventPayload,
	State,
} from 'react-native-gesture-handler';
import {
	cancelAnimation,
	runOnJS,
	runOnUI,
	useAnimatedReaction,
	useSharedValue,
	type WithSpringConfig,
} from 'react-native-reanimated';

import {
	DndContext,
	DraggableStates,
	type DndContextValue,
	type DraggableOptions,
	type DroppableOptions,
	type ItemOptions,
	type Layouts,
	type Offsets,
} from './DndContext';
import { useSharedPoint } from './hooks';
import {
	animatePointWithSpring,
	applyOffset,
	getDistance,
	includesPoint,
	overlapsRectangle,
	Point,
	Rectangle,
} from './utils';

import type { UniqueIdentifier } from './types';

export type HapticFeedbackType =
	| 'impactLight'
	| 'impactMedium'
	| 'impactHeavy'
	| 'notificationSuccess'
	| 'notificationWarning'
	| 'notificationError'
	| 'selection';

export type DndProviderProps = {
	springConfig?: WithSpringConfig;
	activationDelay?: number;
	minDistance?: number;
	disabled?: boolean;
	onDragEnd?: (ev: { active: ItemOptions; over: ItemOptions | null }) => void;
	onBegin?: (
		event: GestureStateChangeEvent<PanGestureHandlerEventPayload>,
		meta: { activeId: UniqueIdentifier; activeLayout: LayoutRectangle }
	) => void;
	onUpdate?: (
		event: GestureUpdateEvent<PanGestureHandlerEventPayload>,
		meta: { activeId: UniqueIdentifier; activeLayout: LayoutRectangle }
	) => void;
	onFinalize?: (
		event: GestureStateChangeEvent<PanGestureHandlerEventPayload>,
		meta: { activeId: UniqueIdentifier; activeLayout: LayoutRectangle }
	) => void;
	// Updated to use Expo Haptics type
	hapticFeedback?: HapticFeedbackType;
	style?: StyleProp<ViewStyle>;
	debug?: boolean;
};

export type DndProviderHandle = Pick<
	DndContextValue,
	'draggableLayouts' | 'draggableOffsets' | 'draggableRestingOffsets' | 'draggableActiveId'
>;

export const DndProvider = forwardRef<DndProviderHandle, PropsWithChildren<DndProviderProps>>(
	function DndProvider(
		{
			children,
			springConfig = {},
			minDistance = 0,
			activationDelay = 0,
			disabled,
			hapticFeedback,
			onDragEnd,
			onBegin,
			onUpdate,
			onFinalize,
			style,
			debug,
		},
		ref
	) {
		const containerRef = useRef<View | null>(null);
		const draggableLayouts = useSharedValue<Layouts>({});
		const droppableLayouts = useSharedValue<Layouts>({});
		const draggableOptions = useSharedValue<DraggableOptions>({});
		const droppableOptions = useSharedValue<DroppableOptions>({});
		const draggableOffsets = useSharedValue<Offsets>({});
		const draggableRestingOffsets = useSharedValue<Offsets>({});
		const draggableStates = useSharedValue<DraggableStates>({});
		const draggablePendingId = useSharedValue<UniqueIdentifier | null>(null);
		const draggableActiveId = useSharedValue<UniqueIdentifier | null>(null);
		const droppableActiveId = useSharedValue<UniqueIdentifier | null>(null);
		const draggableActiveLayout = useSharedValue<Rectangle | null>(null);
		const draggableInitialOffset = useSharedPoint(0, 0);
		const draggableContentOffset = useSharedPoint(0, 0);
		const panGestureState = useSharedValue<GestureEventPayload['state']>(0);

		// Helper to trigger haptic feedback using expo-haptics
		const triggerHapticFeedback = (type: HapticFeedbackType) => {
			switch (type) {
				case 'impactLight':
					Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					break;
				case 'impactMedium':
					Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
					break;
				case 'impactHeavy':
					Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
					break;
				case 'notificationSuccess':
					Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
					break;
				case 'notificationWarning':
					Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
					break;
				case 'notificationError':
					Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
					break;
				case 'selection':
				default:
					Haptics.selectionAsync();
					break;
			}
		};

		const runFeedback = () => {
			if (hapticFeedback) {
				triggerHapticFeedback(hapticFeedback);
			}
		};

		useAnimatedReaction(
			() => draggableActiveId.value,
			(next, prev) => {
				if (next !== prev) {
					// runOnJS(setActiveId)(next);
				}
				if (next !== null) {
					runOnJS(runFeedback)();
				}
			},
			[]
		);

		const contextValue = useRef<DndContextValue>({
			containerRef,
			draggableLayouts,
			droppableLayouts,
			draggableOptions,
			droppableOptions,
			draggableOffsets,
			draggableRestingOffsets,
			draggableStates,
			draggablePendingId,
			draggableActiveId,
			droppableActiveId,
			panGestureState,
			draggableInitialOffset,
			draggableActiveLayout,
			draggableContentOffset,
		});

		useImperativeHandle(ref, () => {
			return {
				draggableLayouts,
				draggableOffsets,
				draggableRestingOffsets,
				draggableActiveId,
			};
		}, []);

		const panGesture = useMemo(() => {
			const findActiveLayoutId = (point: Point): UniqueIdentifier | null => {
				'worklet';
				const { x, y } = point;
				const { value: layouts } = draggableLayouts;
				const { value: offsets } = draggableOffsets;
				const { value: options } = draggableOptions;
				for (const [id, layout] of Object.entries(layouts)) {
					const offset = offsets[id];
					const isDisabled = options[id].disabled;
					if (
						!isDisabled &&
						includesPoint(layout.value, {
							x: x - offset.x.value + draggableContentOffset.x.value,
							y: y - offset.y.value + draggableContentOffset.y.value,
						})
					) {
						return id;
					}
				}
				return null;
			};

			const findDroppableLayoutId = (activeLayout: LayoutRectangle): UniqueIdentifier | null => {
				'worklet';
				const { value: layouts } = droppableLayouts;
				const { value: options } = droppableOptions;
				for (const [id, layout] of Object.entries(layouts)) {
					const isDisabled = options[id].disabled;
					if (!isDisabled && overlapsRectangle(activeLayout, layout.value)) {
						return id;
					}
				}
				return null;
			};

			let timeout: ReturnType<typeof setTimeout> | null = null;
			const clearActiveIdTimeout = () => {
				if (timeout) {
					clearTimeout(timeout);
				}
			};
			const setActiveId = (id: UniqueIdentifier, delay: number) => {
				timeout = setTimeout(() => {
					runOnUI(() => {
						'worklet';
						debug && console.log(`draggableActiveId.value = ${id}`);
						draggableActiveId.value = id;
						draggableStates.value[id].value = 'dragging';
					})();
				}, delay);
			};

			const panGesture = Gesture.Pan()
				.onBegin((event) => {
					const { state, x, y } = event;
					debug && console.log('begin', { state, x, y });
					if (disabled) {
						return;
					}
					panGestureState.value = state;
					const { value: layouts } = draggableLayouts;
					const { value: offsets } = draggableOffsets;
					const { value: restingOffsets } = draggableRestingOffsets;
					const { value: options } = draggableOptions;
					const { value: states } = draggableStates;
					const activeId = findActiveLayoutId({ x, y });
					if (activeId !== null) {
						const activeLayout = layouts[activeId].value;
						const activeOffset = offsets[activeId];
						const restingOffset = restingOffsets[activeId];
						const { value: activeState } = states[activeId];
						draggableInitialOffset.x.value = activeOffset.x.value;
						draggableInitialOffset.y.value = activeOffset.y.value;
						if (['dragging', 'acting'].includes(activeState)) {
							cancelAnimation(activeOffset.x);
							cancelAnimation(activeOffset.y);
						} else {
							restingOffset.x.value = activeOffset.x.value;
							restingOffset.y.value = activeOffset.y.value;
						}
						const { activationDelay } = options[activeId];
						if (activationDelay > 0) {
							draggablePendingId.value = activeId;
							draggableStates.value[activeId].value = 'pending';
							runOnJS(setActiveId)(activeId, activationDelay);
						} else {
							draggableActiveId.value = activeId;
							draggableActiveLayout.value = applyOffset(activeLayout, {
								x: activeOffset.x.value,
								y: activeOffset.y.value,
							});
							draggableStates.value[activeId].value = 'dragging';
						}
						if (onBegin) {
							onBegin(event, { activeId, activeLayout });
						}
					}
				})
				.onUpdate((event) => {
					const { state, translationX, translationY } = event;
					debug && console.log('update', { state, translationX, translationY });
					panGestureState.value = state;
					const { value: activeId } = draggableActiveId;
					const { value: pendingId } = draggablePendingId;
					const { value: options } = draggableOptions;
					const { value: layouts } = draggableLayouts;
					const { value: offsets } = draggableOffsets;
					if (activeId === null) {
						if (pendingId !== null) {
							const { activationTolerance } = options[pendingId];
							const distance = getDistance(translationX, translationY);
							if (distance > activationTolerance) {
								runOnJS(clearActiveIdTimeout)();
								draggablePendingId.value = null;
							}
						}
						return;
					}
					const activeOffset = offsets[activeId];
					activeOffset.x.value = draggableInitialOffset.x.value + translationX;
					activeOffset.y.value = draggableInitialOffset.y.value + translationY;
					const activeLayout = layouts[activeId].value;
					draggableActiveLayout.value = applyOffset(activeLayout, {
						x: activeOffset.x.value,
						y: activeOffset.y.value,
					});
					droppableActiveId.value = findDroppableLayoutId(draggableActiveLayout.value);
					if (onUpdate) {
						onUpdate(event, { activeId, activeLayout: draggableActiveLayout.value });
					}
				})
				.onFinalize((event) => {
					const { state, velocityX, velocityY } = event;
					debug && console.log('finalize', { state, velocityX, velocityY });
					panGestureState.value = state;
					const { value: activeId } = draggableActiveId;
					const { value: pendingId } = draggablePendingId;
					const { value: layouts } = draggableLayouts;
					const { value: offsets } = draggableOffsets;
					const { value: restingOffsets } = draggableRestingOffsets;
					const { value: states } = draggableStates;
					if (activeId === null) {
						if (pendingId !== null) {
							runOnJS(clearActiveIdTimeout)();
							draggablePendingId.value = null;
						}
						return;
					}
					draggableActiveId.value = null;
					if (onFinalize) {
						const activeLayout = layouts[activeId].value;
						const activeOffset = offsets[activeId];
						const updatedLayout = applyOffset(activeLayout, {
							x: activeOffset.x.value,
							y: activeOffset.y.value,
						});
						runOnJS(onFinalize)(event, { activeId, activeLayout: updatedLayout });
					}
					if (state !== State.FAILED && onDragEnd) {
						const { value: dropActiveId } = droppableActiveId;
						onDragEnd({
							active: draggableOptions.value[activeId],
							over: dropActiveId !== null ? droppableOptions.value[dropActiveId] : null,
						});
					}
					droppableActiveId.value = null;
					const activeOffset = offsets[activeId];
					const restingOffset = restingOffsets[activeId];
					states[activeId].value = 'acting';
					const [targetX, targetY] = [restingOffset.x.value, restingOffset.y.value];
					animatePointWithSpring(
						activeOffset,
						[targetX, targetY],
						[
							{ ...springConfig, velocity: velocityX },
							{ ...springConfig, velocity: velocityY },
						],
						([finishedX, finishedY]) => {
							if (
								panGestureState.value !== State.END &&
								panGestureState.value !== State.FAILED &&
								states[activeId].value !== 'acting'
							) {
								return;
							}
							if (states[activeId]) {
								states[activeId].value = 'resting';
							}
						}
					);
				})
				.withTestId('DndProvider.pan');

			if (activationDelay > 0) {
				panGesture.activateAfterLongPress(activationDelay);
			}

			if (minDistance > 0) {
				panGesture.minDistance(minDistance);
			}

			return panGesture;
		}, [disabled]);

		return (
			<DndContext.Provider value={contextValue.current}>
				<GestureDetector gesture={panGesture}>
					<View ref={containerRef} collapsable={false} style={style} testID="view">
						{children}
					</View>
				</GestureDetector>
			</DndContext.Provider>
		);
	}
);
