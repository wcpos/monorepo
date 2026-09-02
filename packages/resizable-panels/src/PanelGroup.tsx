import React from 'react';
import { StyleProp, View, ViewProps, ViewStyle } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { useSharedValue } from 'react-native-reanimated';

import { DragState, PanelGroupContext, TPanelGroupContext } from './PanelGroupContext';
import { createPanelGroupModel } from './model/PanelGroupModel';

import type { Direction, PanelGroupOnLayoutChanged } from './types';

export type ImperativePanelGroupHandle = {
	getId: () => string;
	getLayout: () => number[];
	setLayout: (layout: number[]) => void;
};
export type PanelGroupOnLayout = (layout: number[]) => void;
export interface PanelGroupProps extends Omit<ViewProps, 'onLayout'> {
	ref?: React.Ref<ImperativePanelGroupHandle>;
	direction: Direction;
	disabled?: boolean;
	onLayout?: PanelGroupOnLayout;
	onLayoutChanged?: PanelGroupOnLayoutChanged;
	style?: StyleProp<ViewStyle>;
	children?: React.ReactNode;
}

export function PanelGroup({
	ref,
	children,
	direction,
	disabled = false,
	onLayout,
	onLayoutChanged,
	style,
	...viewProps
}: PanelGroupProps) {
	const groupId = React.useId();
	const [model] = React.useState(() =>
		createPanelGroupModel({ direction, onLayout, onLayoutChanged })
	);
	const dragState = useSharedValue<DragState | null>(null);
	const layoutShared = useSharedValue<number[]>([]);
	const panelIdsShared = useSharedValue<string[]>([]);
	const containerSizeRef = React.useRef({ width: 0, height: 0 });
	const elementsRef = React.useRef(new Map<string, object>());
	const registerElement = React.useCallback((id: string, element: object) => {
		elementsRef.current.set(id, element);
	}, []);
	const unregisterElement = React.useCallback((id: string) => {
		elementsRef.current.delete(id);
	}, []);

	React.useLayoutEffect(() => {
		model.setDirection(direction);
		model.setOnLayout(onLayout);
		model.setOnLayoutChanged(onLayoutChanged);
		if (model.isDirty()) {
			const positions: Record<string, number> = {};
			let allPositionsValid = elementsRef.current.size > 0;
			for (const [id, element] of elementsRef.current) {
				if (!('getBoundingClientRect' in element)) {
					allPositionsValid = false;
					break;
				}
				const getBoundingClientRect = element.getBoundingClientRect;
				if (typeof getBoundingClientRect !== 'function') {
					allPositionsValid = false;
					break;
				}
				const rect = getBoundingClientRect.call(element) as { left: number; top: number };
				const position = direction === 'horizontal' ? rect.left : rect.top;
				if (!Number.isFinite(position)) {
					allPositionsValid = false;
					break;
				}
				positions[id] = position;
			}
			if (allPositionsValid && Object.values(positions).some((position) => position !== 0)) {
				model.setPositions(positions);
			}
		}
		// Child layout effects register panels and handles before this parent effect flushes them.
		model.flush();
	});

	const syncSharedValues = React.useCallback(
		(layout: number[], panelIds: string[]) => {
			layoutShared.set(layout);
			panelIdsShared.set(panelIds);
		},
		[layoutShared, panelIdsShared]
	);
	React.useLayoutEffect(() => {
		const unsubscribe = model.subscribe(syncSharedValues);
		syncSharedValues(model.getLayout(), model.getPanelIds());
		return unsubscribe;
	}, [model, syncSharedValues]);

	const handleContainerLayout = React.useCallback(
		(event: LayoutChangeEvent) => {
			const { width, height } = event.nativeEvent.layout;
			containerSizeRef.current = { width, height };
			model.setContainerSize(direction === 'horizontal' ? width : height);
		},
		[direction, model]
	);
	const beginDrag = React.useCallback(
		(handleId: string) => {
			const size = containerSizeRef.current[direction === 'horizontal' ? 'width' : 'height'];
			if (model.beginDrag(handleId, size)) {
				dragState.set({ dragHandleId: handleId });
			}
		},
		[direction, dragState, model]
	);
	const drag = React.useCallback(
		(translationX: number, translationY: number) =>
			model.drag(direction === 'horizontal' ? translationX : translationY),
		[direction, model]
	);
	const endDrag = React.useCallback(() => {
		model.endDrag();
		dragState.set(null);
	}, [dragState, model]);

	React.useImperativeHandle(
		ref,
		() => ({ getId: () => groupId, getLayout: model.getLayout, setLayout: model.setLayout }),
		[groupId, model]
	);
	const contextValue: TPanelGroupContext = React.useMemo(
		() => ({
			model,
			direction,
			disabled,
			groupId,
			dragState,
			layoutShared,
			panelIdsShared,
			beginDrag,
			drag,
			endDrag,
			registerElement,
			unregisterElement,
		}),
		[
			beginDrag,
			direction,
			disabled,
			drag,
			dragState,
			endDrag,
			groupId,
			layoutShared,
			model,
			panelIdsShared,
			registerElement,
			unregisterElement,
		]
	);
	const containerStyle: StyleProp<ViewStyle> = [
		{ flex: 1, flexDirection: direction === 'horizontal' ? 'row' : 'column' },
		style,
	];

	return (
		<PanelGroupContext.Provider value={contextValue}>
			<View {...viewProps} onLayout={handleContainerLayout} style={containerStyle}>
				{children}
			</View>
		</PanelGroupContext.Provider>
	);
}
