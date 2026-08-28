import React from 'react';
import { StyleProp, ViewProps, ViewStyle } from 'react-native';

import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useUniqueId } from './hooks/useUniqueId';
import { PanelGroupContext } from './PanelGroupContext';
import { parseSize } from './utils/parseSize';

import type { GroupResizeBehavior } from './types';

export type PanelOnCollapse = () => void;
export type PanelOnExpand = () => void;
export type PanelOnResize = (size: number, prevSize: number | undefined) => void;
export type PanelSize = number | string;
export type PanelCallbacks = {
	onCollapse?: PanelOnCollapse;
	onExpand?: PanelOnExpand;
	onResize?: PanelOnResize;
};
export type PanelConstraints = {
	collapsedSize?: PanelSize;
	collapsible?: boolean;
	defaultSize?: PanelSize;
	disabled?: boolean;
	groupResizeBehavior?: GroupResizeBehavior;
	maxSize?: PanelSize;
	minSize?: PanelSize;
};
export type ResolvedPanelConstraints = Omit<
	PanelConstraints,
	'collapsedSize' | 'defaultSize' | 'maxSize' | 'minSize'
> & {
	collapsedSize?: number;
	defaultSize?: number;
	maxSize?: number;
	minSize?: number;
};
export type PanelData = {
	callbacks: PanelCallbacks;
	constraints: PanelConstraints;
	id: string;
	idIsFromProps: boolean;
	order?: number;
};
export type ImperativePanelHandle = {
	collapse: () => void;
	expand: (minSize?: number) => void;
	getId(): string;
	getSize(): number;
	isCollapsed: () => boolean;
	isExpanded: () => boolean;
	resize: (size: number) => void;
};
export type PanelProps = ViewProps &
	PanelConstraints &
	PanelCallbacks & {
		id?: string;
		order?: number;
		style?: StyleProp<ViewStyle>;
		children?: React.ReactNode;
		ref?: React.Ref<ImperativePanelHandle>;
	};

export function Panel({
	ref,
	children,
	collapsedSize,
	collapsible,
	defaultSize,
	disabled,
	groupResizeBehavior,
	id: idFromProps,
	maxSize,
	minSize,
	onCollapse,
	onExpand,
	onResize,
	order,
	style: styleFromProps,
	...viewProps
}: PanelProps) {
	const context = React.useContext(PanelGroupContext);
	if (context === null) throw new Error(`<Panel> must be rendered inside a <PanelGroup>`);
	const { model, layoutShared, panelIdsShared, dragState, registerElement, unregisterElement } =
		context;
	const panelId = useUniqueId(idFromProps);
	const panelDataRef = React.useRef<PanelData>({
		callbacks: { onCollapse, onExpand, onResize },
		constraints: {
			collapsedSize,
			collapsible,
			defaultSize,
			disabled,
			groupResizeBehavior,
			maxSize,
			minSize,
		},
		id: panelId,
		idIsFromProps: idFromProps !== undefined,
		order,
	});

	React.useLayoutEffect(() => {
		const { callbacks, constraints } = panelDataRef.current;
		const prevConstraints = { ...constraints };
		panelDataRef.current.id = panelId;
		panelDataRef.current.idIsFromProps = idFromProps !== undefined;
		panelDataRef.current.order = order;
		Object.assign(callbacks, { onCollapse, onExpand, onResize });
		Object.assign(constraints, {
			collapsedSize,
			collapsible,
			defaultSize,
			disabled,
			groupResizeBehavior,
			maxSize,
			minSize,
		});
		if (
			prevConstraints.collapsedSize !== constraints.collapsedSize ||
			prevConstraints.collapsible !== constraints.collapsible ||
			prevConstraints.maxSize !== constraints.maxSize ||
			prevConstraints.minSize !== constraints.minSize
		) {
			model.reevaluatePanelConstraints(panelDataRef.current.id, prevConstraints);
		}
	});
	React.useLayoutEffect(() => {
		const panelData = panelDataRef.current;
		model.registerPanel(panelData);
		return () => model.unregisterPanel(panelData.id);
	}, [model, order, panelId]);
	const setElementRef = React.useCallback(
		(element: object | null) => {
			if (element) registerElement(panelId, element);
			else unregisterElement(panelId);
		},
		[panelId, registerElement, unregisterElement]
	);

	React.useImperativeHandle(
		ref,
		() => ({
			collapse: () => model.collapsePanel(panelDataRef.current.id),
			expand: (size?: number) => model.expandPanel(panelDataRef.current.id, size),
			getId: () => panelId,
			getSize: () => model.getPanelSize(panelDataRef.current.id),
			isCollapsed: () => model.isPanelCollapsed(panelDataRef.current.id),
			isExpanded: () => model.isPanelExpanded(panelDataRef.current.id),
			resize: (size: number) => model.resizePanel(panelDataRef.current.id, size),
		}),
		[model, panelId]
	);

	const parsedDefaultSize = defaultSize == null ? undefined : parseSize(defaultSize);
	const defaultFlexGrow = parsedDefaultSize?.unit === 'percent' ? parsedDefaultSize.value : 1;
	const animatedStyle = useAnimatedStyle(() => {
		const layout = layoutShared.value;
		const panelIds = panelIdsShared.value;
		const currentDragState = dragState.value;

		const panelIndex = panelIds.indexOf(panelId);

		const size = panelIndex > -1 ? layout[panelIndex] : undefined;

		let flexGrowValue: number;
		const precision = 3;

		if (size == null) {
			flexGrowValue = Number(defaultFlexGrow.toPrecision(precision));
		} else if (panelIds.length === 1) {
			flexGrowValue = 1;
		} else {
			flexGrowValue = Number(size.toPrecision(precision));
		}

		return {
			flexBasis: 0,
			flexGrow: flexGrowValue,
			flexShrink: 1,
			overflow: 'hidden',
			pointerEvents: currentDragState !== null ? 'none' : 'auto',
		};
	}, [panelId, defaultFlexGrow]);

	return (
		<Animated.View ref={setElementRef} {...viewProps} style={[animatedStyle, styleFromProps]}>
			{children}
		</Animated.View>
	);
}
