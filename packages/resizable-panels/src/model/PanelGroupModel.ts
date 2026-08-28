import { getLogger } from '@wcpos/utils/logger';

import { adjustLayoutByDelta } from '../utils/adjustLayoutByDelta';
import { areEqual } from '../utils/arrays';
import { assert } from '../utils/assert';
import { calculateUnsafeDefaultLayout } from '../utils/calculateUnsafeDefaultLayout';
import { callPanelCallbacks } from '../utils/callPanelCallbacks';
import { compareLayouts } from '../utils/compareLayouts';
import { fuzzyCompareNumbers } from '../utils/numbers/fuzzyCompareNumbers';
import { fuzzyNumbersEqual } from '../utils/numbers/fuzzyNumbersEqual';
import { parseSize } from '../utils/parseSize';
import { preserveFixedPanelSizes } from '../utils/preserveFixedPanelSizes';
import { validatePanelGroupLayout } from '../utils/validatePanelGroupLayout';

import type { PanelConstraints, PanelData, ResolvedPanelConstraints } from '../Panel';
import type { Direction, PanelGroupOnLayoutChanged } from '../types';

const log = getLogger(['wcpos', 'ui', 'resizable-panels']);

type LayoutListener = (layout: number[], panelIds: string[]) => void;
type HandleData = { id: string; order?: number };
type Ordered = { id: string; order?: number };
type CommitMeta = { isUserInteraction: boolean };

export type PanelGroupModel = {
	setDirection: (direction: Direction) => void;
	setOnLayout: (onLayout?: (layout: number[]) => void) => void;
	setOnLayoutChanged: (onLayoutChanged?: PanelGroupOnLayoutChanged) => void;
	setContainerSize: (size: number) => void;
	setPositions: (positions: Record<string, number>) => void;
	isDirty: () => boolean;
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
	onLayoutChanged?: PanelGroupOnLayoutChanged;
}): PanelGroupModel {
	let direction = options.direction;
	let onLayout = options.onLayout;
	let onLayoutChanged = options.onLayoutChanged;
	let panels: PanelData[] = [];
	let handles: HandleData[] = [];
	let positions: Record<string, number> = {};
	let layout: number[] = [];
	let containerSizePx = 0;
	let defaultLayoutDeferred = false;
	let warnedAllPixelPreserving = false;
	let registrationCounter = 0;
	const registrationOrder = new Map<string, number>();
	const panelIdToLastNotifiedSize: Record<string, number> = {};
	const panelSizeBeforeCollapse = new Map<string, number>();
	let dragState: {
		handleId: string;
		initialLayout: number[];
		pivotIndices: [number, number];
		containerSizePx: number;
	} | null = null;
	let dirty = false;
	let layoutDirty = false;
	let flushScheduled = false;
	const listeners = new Set<LayoutListener>();

	const getPanelIds = () => panels.map((panel) => panel.id);
	const notifyListeners = () => {
		const panelIds = getPanelIds();
		listeners.forEach((listener) => listener(layout, panelIds));
	};
	const resolveSize = (
		size: number | string | undefined,
		pixelFallback: number | undefined
	): number | undefined => {
		if (size == null) return undefined;
		const parsed = parseSize(size);
		if (parsed.unit === 'percent') return parsed.value;
		return containerSizePx > 0 ? (parsed.value / containerSizePx) * 100 : pixelFallback;
	};
	const resolveConstraints = (raw: PanelConstraints): ResolvedPanelConstraints => ({
		collapsedSize: resolveSize(raw.collapsedSize, 0),
		collapsible: raw.collapsible,
		defaultSize: resolveSize(raw.defaultSize, undefined),
		disabled: raw.disabled,
		groupResizeBehavior: raw.groupResizeBehavior,
		maxSize: resolveSize(raw.maxSize, 100),
		minSize: resolveSize(raw.minSize, 0),
	});
	const getResolvedPanels = () =>
		panels.map((panel) => ({ ...panel, constraints: resolveConstraints(panel.constraints) }));
	const getResolvedConstraints = () => panels.map((panel) => resolveConstraints(panel.constraints));
	const hasPixelConstraints = () =>
		panels.some((panel) =>
			[
				panel.constraints.collapsedSize,
				panel.constraints.defaultSize,
				panel.constraints.maxSize,
				panel.constraints.minSize,
			].some((size) => size != null && parseSize(size).unit === 'pixels')
		);
	const commit = (nextLayout: number[], meta: CommitMeta) => {
		layout = nextLayout;
		onLayout?.(nextLayout);
		callPanelCallbacks(getResolvedPanels(), nextLayout, panelIdToLastNotifiedSize);
		notifyListeners();
		if (!(dragState && meta.isUserInteraction)) onLayoutChanged?.(nextLayout, meta);
	};
	const getPanelIndex = (id: string) => panels.findIndex((panel) => panel.id === id);
	const panelDataHelper = (id: string) => {
		const panelIndex = getPanelIndex(id);
		const panelData = panels[panelIndex];
		assert(panelData, `Panel data not found for panel "${id}"`);
		const isLastPanel = panelIndex === panels.length - 1;
		return {
			...resolveConstraints(panelData.constraints),
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
	const setOnLayoutChanged = (nextOnLayoutChanged?: PanelGroupOnLayoutChanged) => {
		onLayoutChanged = nextOnLayoutChanged;
	};
	// Registrations are batched: the PanelGroup adapter flushes synchronously in its layout
	// effect after all children have registered. The microtask is the safety net for a Panel
	// that mounts or unmounts on its own (state living between the group and the panel), where
	// the group never re-renders and would otherwise never flush.
	const markDirty = (requiresLayout = true) => {
		dirty = true;
		layoutDirty ||= requiresLayout;
		if (flushScheduled) return;
		flushScheduled = true;
		queueMicrotask(() => {
			flushScheduled = false;
			flush();
		});
	};
	const compareRegistration = (a: Ordered, b: Ordered) =>
		(registrationOrder.get(a.id) ?? 0) - (registrationOrder.get(b.id) ?? 0);
	const getOrdered = <T extends Ordered>(items: T[]): T[] => {
		const allChildren: Ordered[] = [...panels, ...handles];
		if (allChildren.some((child) => child.order != null)) {
			return [...items].sort((a, b) => compareOrder(a, b) || compareRegistration(a, b));
		}
		if (
			allChildren.length > 0 &&
			allChildren.every((child) => Number.isFinite(positions[child.id]))
		) {
			return [...items].sort(
				(a, b) => (positions[a.id] ?? 0) - (positions[b.id] ?? 0) || compareRegistration(a, b)
			);
		}
		return [...items].sort(compareRegistration);
	};
	const applyOrdering = () => {
		panels = getOrdered(panels);
		handles = getOrdered(handles);
	};
	const registerPanel = (panelData: PanelData) => {
		registrationOrder.set(panelData.id, registrationCounter++);
		delete positions[panelData.id];
		panels = [...panels, panelData];
		applyOrdering();
		markDirty();
	};
	const unregisterPanel = (id: string) => {
		panels = panels.filter((panel) => panel.id !== id);
		registrationOrder.delete(id);
		delete positions[id];
		delete panelIdToLastNotifiedSize[id];
		markDirty();
	};
	const registerHandle = (id: string, order?: number) => {
		registrationOrder.set(id, registrationCounter++);
		delete positions[id];
		handles = [...handles, { id, order }];
		applyOrdering();
		markDirty(false);
	};
	const unregisterHandle = (id: string) => {
		handles = handles.filter((handle) => handle.id !== id);
		registrationOrder.delete(id);
		delete positions[id];
		markDirty(false);
	};
	const setPositions = (nextPositions: Record<string, number>) => {
		const prevPanelIds = panels.map(({ id }) => id);
		const prevHandleIds = handles.map(({ id }) => id);
		positions = { ...nextPositions };
		applyOrdering();
		const idsEqual = (prevIds: string[], nextIds: string[]) =>
			prevIds.length === nextIds.length && prevIds.every((id, index) => id === nextIds[index]);
		const panelOrderChanged = !idsEqual(
			prevPanelIds,
			panels.map(({ id }) => id)
		);
		const handleOrderChanged = !idsEqual(
			prevHandleIds,
			handles.map(({ id }) => id)
		);
		if (panelOrderChanged || handleOrderChanged) {
			markDirty(panelOrderChanged);
		}
	};
	const isDirty = () => dirty;
	const flush = () => {
		if (!dirty) return;
		const shouldRelayout = layoutDirty;
		dirty = false;
		layoutDirty = false;
		if (!shouldRelayout) return;
		if (containerSizePx <= 0 && hasPixelConstraints()) defaultLayoutDeferred = true;
		const resolvedPanels = getResolvedPanels();
		const unsafeLayout = calculateUnsafeDefaultLayout({ panelDataArray: resolvedPanels });
		const nextLayout = validatePanelGroupLayout({
			layout: unsafeLayout,
			panelConstraints: resolvedPanels.map((panel) => panel.constraints),
		});
		if (!areEqual(layout, nextLayout)) {
			commit(nextLayout, { isUserInteraction: false });
		} else {
			notifyListeners();
		}
	};
	const setContainerSize = (nextSize: number) => {
		const prevSize = containerSizePx;
		if (nextSize === prevSize) return;
		containerSizePx = nextSize;
		if (nextSize <= 0 || layout.length === 0) return;
		const panelConstraints = getResolvedConstraints();
		let unsafeLayout = layout;
		if (prevSize <= 0) {
			if (!defaultLayoutDeferred) return;
			defaultLayoutDeferred = false;
			unsafeLayout = calculateUnsafeDefaultLayout({ panelDataArray: getResolvedPanels() });
		} else {
			const allPixelPreserving =
				panels.length > 0 &&
				panels.every((panel) => panel.constraints.groupResizeBehavior === 'preserve-pixel-size');
			if (allPixelPreserving) {
				if (!warnedAllPixelPreserving) {
					warnedAllPixelPreserving = true;
					log.warn('At least one panel must preserve relative size when the group resizes');
				}
			} else {
				unsafeLayout = preserveFixedPanelSizes({
					nextGroupSize: nextSize,
					panelConstraints,
					prevGroupSize: prevSize,
					prevLayout: layout,
				});
			}
		}
		const nextLayout = validatePanelGroupLayout({ layout: unsafeLayout, panelConstraints });
		if (!areEqual(layout, nextLayout)) commit(nextLayout, { isUserInteraction: false });
	};
	const getLayout = () => layout;
	const setLayout = (unsafeLayout: number[]) => {
		const nextLayout = validatePanelGroupLayout({
			layout: unsafeLayout,
			panelConstraints: getResolvedConstraints(),
		});
		if (!areEqual(layout, nextLayout)) commit(nextLayout, { isUserInteraction: false });
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
			panelConstraints: getResolvedConstraints(),
			pivotIndices,
			prevLayout,
			trigger: 'imperative-api',
		});
		if (!compareLayouts(prevLayout, nextLayout)) {
			commit(nextLayout, { isUserInteraction: false });
		}
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
			panelConstraints: getResolvedConstraints(),
			pivotIndices,
			prevLayout,
			trigger: 'imperative-api',
		});
		if (!compareLayouts(prevLayout, nextLayout)) {
			commit(nextLayout, { isUserInteraction: false });
		}
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
			panelConstraints: getResolvedConstraints(),
			pivotIndices,
			prevLayout,
			trigger: 'imperative-api',
		});
		if (!compareLayouts(prevLayout, nextLayout)) {
			commit(nextLayout, { isUserInteraction: false });
		}
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
		if (containerSizePx <= 0 && hasPixelConstraints()) defaultLayoutDeferred = true;
		const { collapsedSize: prevCollapsed = 0, collapsible: prevCollapsible } =
			resolveConstraints(prevConstraints);
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
	const beginDrag = (handleId: string, dragContainerSizePx: number) => {
		const handleIndex = handles.findIndex((handle) => handle.id === handleId);
		if (handleIndex < 0) {
			log.warn(`Handle "${handleId}" not found`);
			return false;
		}
		if (dragContainerSizePx <= 0) {
			log.warn(`Cannot drag handle "${handleId}" in a ${dragContainerSizePx}px container`);
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
			containerSizePx: dragContainerSizePx,
		};
		return true;
	};
	const drag = (translationPx: number) => {
		if (!dragState) return;
		const delta = (translationPx / dragState.containerSizePx) * 100;
		const nextLayout = adjustLayoutByDelta({
			delta,
			initialLayout: dragState.initialLayout,
			panelConstraints: getResolvedConstraints(),
			pivotIndices: dragState.pivotIndices,
			prevLayout: layout,
			trigger: 'mouse-or-touch',
		});
		if (!compareLayouts(layout, nextLayout)) {
			commit(nextLayout, { isUserInteraction: true });
		}
	};
	const endDrag = () => {
		const completedDrag = dragState;
		dragState = null;
		if (completedDrag && !areEqual(completedDrag.initialLayout, layout)) {
			onLayoutChanged?.(layout, { isUserInteraction: true });
		}
	};
	const isDragging = () => dragState !== null;

	return {
		setDirection,
		setOnLayout,
		setOnLayoutChanged,
		setContainerSize,
		setPositions,
		isDirty,
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
