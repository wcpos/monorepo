import React from 'react';
import { StyleProp, View, ViewProps, ViewStyle } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { useSharedValue } from 'react-native-reanimated';

import { DragState, PanelGroupContext, TPanelGroupContext } from './PanelGroupContext';
import { createPanelGroupModel } from './model/PanelGroupModel';

import type { Direction } from './types';

export type ImperativePanelGroupHandle = {
	getId: () => string;
	getLayout: () => number[];
	setLayout: (layout: number[]) => void;
};
export type PanelGroupOnLayout = (layout: number[]) => void;
export interface PanelGroupProps extends Omit<ViewProps, 'onLayout'> {
	ref?: React.Ref<ImperativePanelGroupHandle>;
	direction: Direction;
	onLayout?: PanelGroupOnLayout;
	style?: StyleProp<ViewStyle>;
	children?: React.ReactNode;
}

export function PanelGroup({
	ref,
	children,
	direction,
	onLayout,
	style,
	...viewProps
}: PanelGroupProps) {
	const groupId = React.useId();
	const [model] = React.useState(() => createPanelGroupModel({ direction, onLayout }));
	const dragState = useSharedValue<DragState | null>(null);
	const layoutShared = useSharedValue<number[]>([]);
	const panelIdsShared = useSharedValue<string[]>([]);
	const containerSizeRef = React.useRef({ width: 0, height: 0 });

	React.useLayoutEffect(() => {
		model.setDirection(direction);
		model.setOnLayout(onLayout);
		// Child layout effects register panels and handles before this parent effect flushes them.
		model.flush();
	});

	const syncSharedValues = React.useCallback(
		(layout: number[], panelIds: string[]) => {
			// eslint-disable-next-line react-hooks/immutability -- reanimated shared value is the layout store
			layoutShared.value = layout;
			// eslint-disable-next-line react-hooks/immutability -- reanimated shared value is the layout store
			panelIdsShared.value = panelIds;
		},
		[layoutShared, panelIdsShared]
	);
	React.useLayoutEffect(() => {
		const unsubscribe = model.subscribe(syncSharedValues);
		syncSharedValues(model.getLayout(), model.getPanelIds());
		return unsubscribe;
	}, [model, syncSharedValues]);

	const handleContainerLayout = React.useCallback((event: LayoutChangeEvent) => {
		const { width, height } = event.nativeEvent.layout;
		containerSizeRef.current = { width, height };
	}, []);
	const beginDrag = React.useCallback(
		(handleId: string) => {
			const size = containerSizeRef.current[direction === 'horizontal' ? 'width' : 'height'];
			if (model.beginDrag(handleId, size)) {
				// eslint-disable-next-line react-hooks/immutability -- reanimated shared value is the drag store
				dragState.value = { dragHandleId: handleId };
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
		// eslint-disable-next-line react-hooks/immutability -- reanimated shared value is the drag store
		dragState.value = null;
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
			groupId,
			dragState,
			layoutShared,
			panelIdsShared,
			beginDrag,
			drag,
			endDrag,
		}),
		[beginDrag, direction, drag, dragState, endDrag, groupId, layoutShared, model, panelIdsShared]
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
