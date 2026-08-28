import { getLogger } from '@wcpos/utils/logger';

import { adjustLayoutByDelta } from '../utils/adjustLayoutByDelta';
import { areEqual } from '../utils/arrays';
import { assert } from '../utils/assert';
import { calculateUnsafeDefaultLayout } from '../utils/calculateUnsafeDefaultLayout';
import { callPanelCallbacks } from '../utils/callPanelCallbacks';
import { compareLayouts } from '../utils/compareLayouts';
import { fuzzyCompareNumbers } from '../utils/numbers/fuzzyCompareNumbers';
import { fuzzyNumbersEqual } from '../utils/numbers/fuzzyNumbersEqual';
import { validatePanelGroupLayout } from '../utils/validatePanelGroupLayout';

import type { PanelConstraints, PanelData } from '../Panel';
import type { Direction } from '../types';

const log = getLogger(['wcpos', 'ui', 'resizable-panels']);

type LayoutListener = (layout: number[], panelIds: string[]) => void;

export type PanelGroupModel = {
	setDirection: (direction: Direction) => void;
	setOnLayout: (onLayout?: (layout: number[]) => void) => void;
	registerPanel: (panelData: PanelData) => void;
	unregisterPanel: (id: string) => void;
	registerHandle: (id: string, order?: number) => void;
	unregisterHandle: (id: string) => void;
	flush: () => void;
	getLayout: () => number[];
	getPanelIds: () => string[];
	setLayout: (unsafeLayout: number[]) => void;
	subscribe: (listener: LayoutListener) => () => void;
	collapsePanel: (id: string) => void;
	expandPanel: (id: string, minSizeOverride?: number) => void;
	resizePanel: (id: string, size: number) => void;
	getPanelSize: (id: string) => number;
	isPanelCollapsed: (id: string) => boolean;
	isPanelExpanded: (id: string) => boolean;
	getPanelIndex: (id: string) => number;
	reevaluatePanelConstraints: (id: string, prevConstraints: PanelConstraints) => void;
	beginDrag: (handleId: string, containerSizePx: number) => boolean;
	drag: (translationPx: number) => void;
	endDrag: () => void;
	isDragging: () => boolean;
};

type Ordered = { order?: number };

function compareOrder(a: Ordered, b: Ordered) {
	const oa = a.order;
	const ob = b.order;
	if (oa == null && ob == null) return 0;
	if (oa == null) return -1;
	if (ob == null) return 1;
	return oa - ob;
}

export function createPanelGroupModel(options: {
	direction: Direction;
	onLayout?: (layout: number[]) => void;
}): PanelGroupModel {
	let direction = options.direction;
	let onLayout = options.onLayout;
	let panels: PanelData[] = [];
	let handles: { id: string; order?: number }[] = [];
	let layout: number[] = [];
	const panelIdToLastNotifiedSize: Record<string, number> = {};
	const panelSizeBeforeCollapse = new Map<string, number>();
	let dragState: {
		handleId: string;
		initialLayout: number[];
		pivotIndices: [number, number];
		containerSizePx: number;
	} | null = null;
	let dirty = false;
	let flushScheduled = false;
	const listeners = new Set<LayoutListener>();

	const getPanelIds = () => panels.map((panel) => panel.id);
	const notifyListeners = () => {
		const panelIds = getPanelIds();
		listeners.forEach((listener) => listener(layout, panelIds));
	};
	const commit = (nextLayout: number[]) => {
		layout = nextLayout;
		onLayout?.(nextLayout);
		callPanelCallbacks(panels, nextLayout, panelIdToLastNotifiedSize);
		notifyListeners();
	};
	const getPanelIndex = (id: string) => panels.findIndex((panel) => panel.id === id);
	const panelDataHelper = (id: string) => {
		const panelIndex = getPanelIndex(id);
		const panelData = panels[panelIndex];
		assert(panelData, `Panel data not found for panel "${id}"`);
		const isLastPanel = panelIndex === panels.length - 1;
		return {
			...panelData.constraints,
			panelData,
			panelIndex,
			panelSize: layout[panelIndex],
			pivotIndices: isLastPanel
				? ([panelIndex - 1, panelIndex] as [number, number])
				: ([panelIndex, panelIndex + 1] as [number, number]),
		};
	};
	const setDirection = (nextDirection: Direction) => {
		if (direction !== nextDirection) direction = nextDirection;
	};
	const setOnLayout = (nextOnLayout?: (layout: number[]) => void) => {
		onLayout = nextOnLayout;
	};
	// Registrations are batched: the PanelGroup adapter flushes synchronously in its layout
	// effect after all children have registered. The microtask is the safety net for a Panel
	// that mounts or unmounts on its own (state living between the group and the panel), where
	// the group never re-renders and would otherwise never flush.
	const markDirty = () => {
		dirty = true;
		if (flushScheduled) return;
		flushScheduled = true;
		queueMicrotask(() => {
			flushScheduled = false;
			flush();
		});
	};
	const registerPanel = (panelData: PanelData) => {
		panels = [...panels, panelData].sort(compareOrder);
		markDirty();
	};
	const unregisterPanel = (id: string) => {
		panels = panels.filter((panel) => panel.id !== id);
		delete panelIdToLastNotifiedSize[id];
		markDirty();
	};
	const registerHandle = (id: string, order?: number) => {
		handles = [...handles, { id, order }].sort(compareOrder);
	};
	const unregisterHandle = (id: string) => {
		handles = handles.filter((handle) => handle.id !== id);
	};
	const flush = () => {
		if (!dirty) return;
		dirty = false;
		const unsafeLayout = calculateUnsafeDefaultLayout({ panelDataArray: panels });
		const nextLayout = validatePanelGroupLayout({
			layout: unsafeLayout,
			panelConstraints: panels.map((panel) => panel.constraints),
		});
		if (!areEqual(layout, nextLayout)) {
			commit(nextLayout);
		} else {
			notifyListeners();
		}
	};
	const getLayout = () => layout;
	const setLayout = (unsafeLayout: number[]) => {
		const nextLayout = validatePanelGroupLayout({
			layout: unsafeLayout,
			panelConstraints: panels.map((panel) => panel.constraints),
		});
		if (!areEqual(layout, nextLayout)) commit(nextLayout);
	};
	const subscribe = (listener: LayoutListener) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};
	const collapsePanel = (id: string) => {
		const prevLayout = layout;
		const {
			collapsedSize = 0,
			panelData,
			panelIndex,
			panelSize,
			pivotIndices,
		} = panelDataHelper(id);
		if (!panelData.constraints.collapsible || panelSize == null || panelSize === collapsedSize)
			return;
		panelSizeBeforeCollapse.set(id, panelSize);
		const delta =
			panelIndex === panels.length - 1 ? panelSize - collapsedSize : collapsedSize - panelSize;
		const nextLayout = adjustLayoutByDelta({
			delta,
			initialLayout: prevLayout,
			panelConstraints: panels.map((panel) => panel.constraints),
			pivotIndices,
			prevLayout,
			trigger: 'imperative-api',
		});
		if (!compareLayouts(prevLayout, nextLayout)) commit(nextLayout);
	};
	const expandPanel = (id: string, minSizeOverride?: number) => {
		const prevLayout = layout;
		const {
			collapsedSize = 0,
			minSize: minSizeFromProps = 0,
			panelData,
			panelIndex,
			panelSize = 0,
			pivotIndices,
		} = panelDataHelper(id);
		if (!panelData.constraints.collapsible || panelSize !== collapsedSize) return;
		const minSize = minSizeOverride ?? minSizeFromProps;
		const prevPanelSize = panelSizeBeforeCollapse.get(id);
		const baseSize = prevPanelSize != null && prevPanelSize >= minSize ? prevPanelSize : minSize;
		const delta = panelIndex === panels.length - 1 ? panelSize - baseSize : baseSize - panelSize;
		const nextLayout = adjustLayoutByDelta({
			delta,
			initialLayout: prevLayout,
			panelConstraints: panels.map((panel) => panel.constraints),
			pivotIndices,
			prevLayout,
			trigger: 'imperative-api',
		});
		if (!compareLayouts(prevLayout, nextLayout)) commit(nextLayout);
	};
	const resizePanel = (id: string, unsafePanelSize: number) => {
		const prevLayout = layout;
		const { panelIndex, panelSize, pivotIndices } = panelDataHelper(id);
		if (panelSize == null) return;
		const delta =
			panelIndex === panels.length - 1 ? panelSize - unsafePanelSize : unsafePanelSize - panelSize;
		const nextLayout = adjustLayoutByDelta({
			delta,
			initialLayout: prevLayout,
			panelConstraints: panels.map((panel) => panel.constraints),
			pivotIndices,
			prevLayout,
			trigger: 'mouse-or-touch',
		});
		if (!compareLayouts(prevLayout, nextLayout)) commit(nextLayout);
	};
	const getPanelSize = (id: string) => {
		const { panelSize } = panelDataHelper(id);
		assert(panelSize != null, `Panel size not found for panel "${id}"`);
		return panelSize;
	};
	const isPanelCollapsed = (id: string) => {
		const { collapsedSize = 0, collapsible, panelSize } = panelDataHelper(id);
		assert(panelSize != null, `Panel size not found for panel "${id}"`);
		return collapsible === true && fuzzyNumbersEqual(panelSize, collapsedSize);
	};
	const isPanelExpanded = (id: string) => {
		const { collapsedSize = 0, collapsible, panelSize } = panelDataHelper(id);
		assert(panelSize != null, `Panel size not found for panel "${id}"`);
		return !collapsible || fuzzyCompareNumbers(panelSize, collapsedSize) > 0;
	};
	const reevaluatePanelConstraints = (id: string, prevConstraints: PanelConstraints) => {
		const { collapsedSize: prevCollapsed = 0, collapsible: prevCollapsible } = prevConstraints;
		const {
			collapsedSize: nextCollapsed = 0,
			collapsible: nextCollapsible,
			maxSize: nextMax = 100,
			minSize: nextMin = 0,
			panelSize: prevPanelSize,
		} = panelDataHelper(id);
		if (prevPanelSize == null) return;
		if (prevCollapsible && nextCollapsible && prevPanelSize === prevCollapsed) {
			if (prevCollapsed !== nextCollapsed) resizePanel(id, nextCollapsed);
		} else if (prevPanelSize < nextMin) {
			resizePanel(id, nextMin);
		} else if (prevPanelSize > nextMax) {
			resizePanel(id, nextMax);
		}
	};
	const beginDrag = (handleId: string, containerSizePx: number) => {
		const handleIndex = handles.findIndex((handle) => handle.id === handleId);
		if (handleIndex < 0) {
			log.warn(`Handle "${handleId}" not found`);
			return false;
		}
		if (containerSizePx <= 0) {
			log.warn(`Cannot drag handle "${handleId}" in a ${containerSizePx}px container`);
			return false;
		}
		if (handleIndex + 1 >= panels.length) {
			log.warn(`Handle "${handleId}" has no panel on both sides`);
			return false;
		}
		dragState = {
			handleId,
			initialLayout: layout,
			pivotIndices: [handleIndex, handleIndex + 1],
			containerSizePx,
		};
		return true;
	};
	const drag = (translationPx: number) => {
		if (!dragState) return;
		const delta = (translationPx / dragState.containerSizePx) * 100;
		const nextLayout = adjustLayoutByDelta({
			delta,
			initialLayout: dragState.initialLayout,
			panelConstraints: panels.map((panel) => panel.constraints),
			pivotIndices: dragState.pivotIndices,
			prevLayout: layout,
			trigger: 'mouse-or-touch',
		});
		if (!compareLayouts(layout, nextLayout)) commit(nextLayout);
	};
	const endDrag = () => {
		dragState = null;
	};
	const isDragging = () => dragState !== null;

	return {
		setDirection,
		setOnLayout,
		registerPanel,
		unregisterPanel,
		registerHandle,
		unregisterHandle,
		flush,
		getLayout,
		getPanelIds,
		setLayout,
		subscribe,
		collapsePanel,
		expandPanel,
		resizePanel,
		getPanelSize,
		isPanelCollapsed,
		isPanelExpanded,
		getPanelIndex,
		reevaluatePanelConstraints,
		beginDrag,
		drag,
		endDrag,
		isDragging,
	};
}
