import React from 'react';
import { StyleProp, View, ViewProps, ViewStyle } from 'react-native';

import { useSharedValue } from 'react-native-reanimated';

import { getLogger } from '@wcpos/utils/logger';

import { DragState, PanelGroupContext, TPanelGroupContext } from './PanelGroupContext';
import { Direction } from './types';
import { adjustLayoutByDelta } from './utils/adjustLayoutByDelta';
import { areEqual } from './utils/arrays';
import { assert } from './utils/assert';
import { calculateUnsafeDefaultLayout } from './utils/calculateUnsafeDefaultLayout';
import { callPanelCallbacks } from './utils/callPanelCallbacks';
import { compareLayouts } from './utils/compareLayouts';
import { fuzzyCompareNumbers } from './utils/numbers/fuzzyCompareNumbers';
import { fuzzyNumbersEqual } from './utils/numbers/fuzzyNumbersEqual';
import { validatePanelGroupLayout } from './utils/validatePanelGroupLayout';

import type { PanelConstraints, PanelData } from './Panel';
import type {
	GestureUpdateEvent,
	PanGestureHandlerEventPayload,
} from 'react-native-gesture-handler';

const log = getLogger(['wcpos', 'ui', 'resizable-panels']);

export type ImperativePanelGroupHandle = {
	getId: () => string;
	getLayout: () => number[];
	setLayout: (layout: number[]) => void;
};

export type PanelGroupOnLayout = (layout: number[]) => void;

export interface PanelGroupProps extends Omit<ViewProps, 'onLayout'> {
	ref?: React.Ref<ImperativePanelGroupHandle>;
	direction: Direction;
	onLayout?: (layout: number[]) => void;
	style?: StyleProp<ViewStyle>;
	children?: React.ReactNode;
}

export function PanelGroup({
	ref,
	children,
	direction,
	onLayout = () => {},
	style,
	...viewProps
}: PanelGroupProps) {
	const groupId = React.useId();
	const panelGroupRef = React.useRef<View | null>(null);

	const dragStateSV = useSharedValue<DragState | null>(null);
	const layoutShared = useSharedValue<number[]>([]);
	const panelIdsShared = useSharedValue<string[]>([]);

	const [panelDataArray, setPanelDataArray] = React.useState<PanelData[]>([]);

	const panelIdToLastNotifiedSizeMapRef = React.useRef<Record<string, number>>({});
	const panelSizeBeforeCollapseRef = React.useRef<Map<string, number>>(new Map());

	const handleCountRef = React.useRef<number>(0);
	const handleToPivotsRef = React.useRef<Record<string, [number, number]>>({});

	const committedValuesRef = React.useRef<{
		direction: Direction;
		onLayout: PanelGroupOnLayout;
	}>({
		direction,
		onLayout,
	});

	React.useLayoutEffect(() => {
		committedValuesRef.current = {
			direction,
			onLayout,
		};
	}, [direction, onLayout]);

	const setLayout = React.useCallback(
		(nextLayout: number[]) => {
			const { onLayout } = committedValuesRef.current;
			// eslint-disable-next-line react-hooks/immutability -- reanimated shared value is the layout store
			layoutShared.value = nextLayout;
			onLayout(nextLayout);
			callPanelCallbacks(panelDataArray, nextLayout, panelIdToLastNotifiedSizeMapRef.current);
		},
		[layoutShared, panelDataArray]
	);

	React.useLayoutEffect(() => {
		const unsafeLayout = calculateUnsafeDefaultLayout({ panelDataArray });
		const nextLayout = validatePanelGroupLayout({
			layout: unsafeLayout,
			panelConstraints: panelDataArray.map((pd) => pd.constraints),
		});

		if (!areEqual(layoutShared.value, nextLayout)) {
			setLayout(nextLayout);
		}

		panelIdsShared.value = panelDataArray.map((pd) => pd.id);
	}, [panelDataArray, layoutShared, panelIdsShared, setLayout]);

	const registerPanel = React.useCallback((panelData: PanelData) => {
		setPanelDataArray((currentPanelDataArray) => {
			const newArray = [...currentPanelDataArray, panelData];
			newArray.sort((a, b) => {
				const oa = a.order,
					ob = b.order;
				if (oa == null && ob == null) return 0;
				if (oa == null) return -1;
				if (ob == null) return 1;
				return oa - ob;
			});
			return newArray;
		});
	}, []);

	const unregisterPanel = React.useCallback((panelData: PanelData) => {
		setPanelDataArray((currentPanelDataArray) => {
			const idx = currentPanelDataArray.findIndex((pd) => pd.id === panelData.id);
			if (idx >= 0) {
				delete panelIdToLastNotifiedSizeMapRef.current[panelData.id];
				const newArray = [...currentPanelDataArray];
				newArray.splice(idx, 1);
				return newArray;
			}
			return currentPanelDataArray;
		});
	}, []);

	React.useImperativeHandle(
		ref,
		() => ({
			getId: () => groupId,
			getLayout: () => layoutShared.value,
			setLayout: (unsafeLayout: number[]) => {
				const prevLayout = layoutShared.value;
				const safeLayout = validatePanelGroupLayout({
					layout: unsafeLayout,
					panelConstraints: panelDataArray.map((pd) => pd.constraints),
				});
				if (!areEqual(prevLayout, safeLayout)) {
					setLayout(safeLayout);
				}
			},
		}),
		[layoutShared, panelDataArray, setLayout]
	);

	const registerHandle = React.useCallback((handleId: string): [number, number] => {
		const leftIndex = handleCountRef.current;
		const rightIndex = leftIndex + 1;
		handleToPivotsRef.current[handleId] = [leftIndex, rightIndex];
		handleCountRef.current += 1;
		return [leftIndex, rightIndex];
	}, []);

	const collapsePanel = React.useCallback(
		(panelData: PanelData) => {
			const prevLayout = layoutShared.value;
			if (panelData.constraints.collapsible) {
				const constraintsArr = panelDataArray.map((pd) => pd.constraints);
				const {
					collapsedSize = 0,
					panelSize,
					pivotIndices,
				} = panelDataHelper(panelDataArray, panelData, prevLayout);
				if (panelSize != null && panelSize !== collapsedSize) {
					panelSizeBeforeCollapseRef.current.set(panelData.id, panelSize);
					const isLast =
						findPanelDataIndex(panelDataArray, panelData) === panelDataArray.length - 1;
					const delta = isLast ? panelSize - collapsedSize : collapsedSize - panelSize;
					const nextLayout = adjustLayoutByDelta({
						delta,
						initialLayout: prevLayout,
						panelConstraints: constraintsArr,
						pivotIndices,
						prevLayout,
						trigger: 'imperative-api',
					});
					if (!compareLayouts(prevLayout, nextLayout)) {
						setLayout(nextLayout);
					}
				}
			}
		},
		[layoutShared, panelDataArray, setLayout]
	);

	const expandPanel = React.useCallback(
		(panelData: PanelData, minSizeOverride?: number) => {
			const prevLayout = layoutShared.value;
			if (panelData.constraints.collapsible) {
				const constraintsArr = panelDataArray.map((pd) => pd.constraints);
				const {
					collapsedSize = 0,
					panelSize = 0,
					minSize: minSizeFromProps = 0,
					pivotIndices,
				} = panelDataHelper(panelDataArray, panelData, prevLayout);

				const minSize = minSizeOverride ?? minSizeFromProps;
				if (panelSize === collapsedSize) {
					const prevPanelSize = panelSizeBeforeCollapseRef.current.get(panelData.id);
					const baseSize =
						prevPanelSize != null && prevPanelSize >= minSize ? prevPanelSize : minSize;
					const isLast =
						findPanelDataIndex(panelDataArray, panelData) === panelDataArray.length - 1;
					const delta = isLast ? panelSize - baseSize : baseSize - panelSize;
					const nextLayout = adjustLayoutByDelta({
						delta,
						initialLayout: prevLayout,
						panelConstraints: constraintsArr,
						pivotIndices,
						prevLayout,
						trigger: 'imperative-api',
					});
					if (!compareLayouts(prevLayout, nextLayout)) {
						setLayout(nextLayout);
					}
				}
			}
		},
		[layoutShared, panelDataArray, setLayout]
	);

	const resizePanel = React.useCallback(
		(panelData: PanelData, unsafePanelSize: number) => {
			const prevLayout = layoutShared.value;
			const constraintsArr = panelDataArray.map((pd) => pd.constraints);
			const { panelSize, pivotIndices } = panelDataHelper(panelDataArray, panelData, prevLayout);
			if (panelSize != null) {
				const isLast = findPanelDataIndex(panelDataArray, panelData) === panelDataArray.length - 1;
				const delta = isLast ? panelSize - unsafePanelSize : unsafePanelSize - panelSize;
				const nextLayout = adjustLayoutByDelta({
					delta,
					initialLayout: prevLayout,
					panelConstraints: constraintsArr,
					pivotIndices,
					prevLayout,
					trigger: 'mouse-or-touch',
				});
				if (!compareLayouts(prevLayout, nextLayout)) {
					setLayout(nextLayout);
				}
			}
		},
		[layoutShared, panelDataArray, setLayout]
	);

	const getPanelSize = React.useCallback(
		(panelData: PanelData) => {
			const { panelSize } = panelDataHelper(panelDataArray, panelData, layoutShared.value);
			assert(panelSize != null, `Panel size not found for panel "${panelData.id}"`);
			return panelSize;
		},
		[layoutShared, panelDataArray]
	);

	const isPanelCollapsed = React.useCallback(
		(panelData: PanelData) => {
			const {
				collapsedSize = 0,
				collapsible,
				panelSize,
			} = panelDataHelper(panelDataArray, panelData, layoutShared.value);
			assert(panelSize != null, `Panel size not found for panel "${panelData.id}"`);
			return collapsible === true && fuzzyNumbersEqual(panelSize, collapsedSize);
		},
		[layoutShared, panelDataArray]
	);

	const isPanelExpanded = React.useCallback(
		(panelData: PanelData) => {
			const {
				collapsedSize = 0,
				collapsible,
				panelSize,
			} = panelDataHelper(panelDataArray, panelData, layoutShared.value);
			assert(panelSize != null, `Panel size not found for panel "${panelData.id}"`);
			return !collapsible || fuzzyCompareNumbers(panelSize, collapsedSize) > 0;
		},
		[layoutShared, panelDataArray]
	);

	const reevaluatePanelConstraints = React.useCallback(
		(panelData: PanelData, prevConstraints: PanelConstraints) => {
			const layout = layoutShared.value;
			const { collapsedSize: prevCollapsed = 0, collapsible: prevCollapsible } = prevConstraints;
			const {
				collapsedSize: nextCollapsed = 0,
				collapsible: nextCollapsible,
				maxSize: nextMax = 100,
				minSize: nextMin = 0,
			} = panelData.constraints;
			const { panelSize: prevPanelSize } = panelDataHelper(panelDataArray, panelData, layout);
			if (prevPanelSize == null) return;
			if (prevCollapsible && nextCollapsible && prevPanelSize === prevCollapsed) {
				if (prevCollapsed !== nextCollapsed) {
					resizePanel(panelData, nextCollapsed);
				}
			} else if (prevPanelSize < nextMin) {
				resizePanel(panelData, nextMin);
			} else if (prevPanelSize > nextMax) {
				resizePanel(panelData, nextMax);
			}
		},
		[layoutShared, panelDataArray, resizePanel]
	);

	const startDragging = React.useCallback(
		(dragHandleId: string) => {
			if (!panelGroupRef.current) return;
			const pivotIndices = handleToPivotsRef.current[dragHandleId];
			if (!pivotIndices) {
				log.warn(`Handle "${dragHandleId}" not found`);
				return;
			}
			panelGroupRef.current.measure((x, y, width, height) => {
				const isHorizontal = committedValuesRef.current.direction === 'horizontal';
				dragStateSV.value = {
					dragHandleId,
					initialLayout: layoutShared.value,
					pivotIndices,
					containerSizePx: isHorizontal ? width : height,
				};
			});
		},
		[dragStateSV, layoutShared]
	);

	const stopDragging = React.useCallback(() => {
		// eslint-disable-next-line react-hooks/immutability -- reanimated shared value is the drag store
		dragStateSV.value = null;
	}, [dragStateSV]);

	const updateLayout = React.useCallback(
		(dragHandleId: string, event: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
			const { value: dragState } = dragStateSV;
			if (!dragState || dragState.dragHandleId !== dragHandleId) {
				return;
			}
			const { direction } = committedValuesRef.current;
			const { initialLayout, pivotIndices, containerSizePx } = dragState;
			const isHorizontal = direction === 'horizontal';
			const delta = isHorizontal ? event.translationX : event.translationY;

			if (containerSizePx === 0) {
				return;
			}

			const deltaPercentage = (delta / containerSizePx) * 100;
			const panelConstraints = panelDataArray.map((pd) => pd.constraints);

			const nextLayout = adjustLayoutByDelta({
				delta: deltaPercentage,
				initialLayout,
				panelConstraints,
				pivotIndices,
				prevLayout: layoutShared.value,
				trigger: 'mouse-or-touch',
			});

			if (!compareLayouts(layoutShared.value, nextLayout)) {
				setLayout(nextLayout);
			}
		},
		[layoutShared, panelDataArray, setLayout]
	);

	const getPanelIndex = React.useCallback(
		(panelData: PanelData): number => {
			return panelDataArray.findIndex((pd) => pd.id === panelData.id);
		},
		[panelDataArray]
	);

	const contextValue: TPanelGroupContext = React.useMemo(
		() => ({
			collapsePanel,
			direction,
			dragState: dragStateSV,
			expandPanel,
			getPanelSize,
			getPanelIndex,
			groupId,
			isPanelCollapsed,
			isPanelExpanded,
			reevaluatePanelConstraints,
			registerPanel,
			registerHandle,
			updateLayout,
			resizePanel,
			startDragging,
			stopDragging,
			unregisterPanel,
			layoutShared,
			panelIdsShared,
		}),
		[
			collapsePanel,
			direction,
			dragStateSV,
			expandPanel,
			getPanelSize,
			getPanelIndex,
			groupId,
			isPanelCollapsed,
			isPanelExpanded,
			reevaluatePanelConstraints,
			registerPanel,
			registerHandle,
			updateLayout,
			resizePanel,
			startDragging,
			stopDragging,
			unregisterPanel,
			layoutShared,
			panelIdsShared,
		]
	);

	const containerStyle: StyleProp<ViewStyle> = [
		{ flex: 1, flexDirection: direction === 'horizontal' ? 'row' : 'column' },
		style,
	];

	return (
		<PanelGroupContext.Provider value={contextValue}>
			<View ref={panelGroupRef} style={containerStyle} {...viewProps}>
				{children}
			</View>
		</PanelGroupContext.Provider>
	);
}

function findPanelDataIndex(panelDataArray: PanelData[], panelData: PanelData) {
	return panelDataArray.findIndex((p) => p.id === panelData.id);
}

function panelDataHelper(panelDataArray: PanelData[], panelData: PanelData, layout: number[]) {
	const panelIndex = findPanelDataIndex(panelDataArray, panelData);
	const isLastPanel = panelIndex === panelDataArray.length - 1;
	const pivotIndices = isLastPanel
		? ([panelIndex - 1, panelIndex] as [number, number])
		: ([panelIndex, panelIndex + 1] as [number, number]);
	const panelSize = layout[panelIndex];
	return {
		...panelData.constraints,
		panelSize,
		pivotIndices,
	};
}
